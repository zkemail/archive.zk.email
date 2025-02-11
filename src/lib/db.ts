import { PrismaClient, Prisma, DkimRecord, DomainSelectorPair } from '@prisma/client'
import { DnsDkimFetchResult } from './utils';

const createPrismaClient = () => {
	let prismaUrl = new URL(process.env.POSTGRES_PRISMA_URL as string);
	prismaUrl.searchParams.set('pool_timeout', '0');
	return new PrismaClient({
		datasources: {
			db: {
				url: prismaUrl.toString()
			},
		},
	});
}

declare global {
	var prismaClient: undefined | ReturnType<typeof createPrismaClient>
}
export const prisma = globalThis.prismaClient ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') {
	globalThis.prismaClient = prisma;
}

export type RecordWithSelector = (DkimRecord & { domainSelectorPair: DomainSelectorPair });

export async function findRecords(domainQuery: string): Promise<RecordWithSelector[]> {
	return await prisma.dkimRecord.findMany({
		where: {
			domainSelectorPair: {
				OR: [
					{
						domain: {
							equals: domainQuery,
							mode: Prisma.QueryMode.insensitive,
						}
					},
					{
						domain: {
							endsWith: '.' + domainQuery,
							mode: Prisma.QueryMode.insensitive,
						}
					}
				]
			},
			value: {
				not: {
					equals: "p="
				}
			}
		},
		include: {
			domainSelectorPair: true
		}
	});
}

export function dspToString(dsp: DomainSelectorPair): string {
	return `#${dsp.id}, ${dsp.domain}, ${dsp.selector}`;
}

export function recordToString(record: DkimRecord): string {
	let value = record.value;
	const maxLen = 50;
	let valueTruncated = (value.length > maxLen) ? value.slice(0, maxLen - 1) + '…' : value;
	return `#${record.id}, "${valueTruncated}"`;
}

export async function updateDspTimestamp(dsp: DomainSelectorPair, timestamp: Date) {
	let updatedSelector = await prisma.domainSelectorPair.update({
		where: {
			id: dsp.id
		},
		data: {
			lastRecordUpdate: timestamp
		}
	})
	console.log(`updated dsp timestamp ${dspToString(updatedSelector)}`);
}

export async function createDkimRecord(dsp: DomainSelectorPair, dkimDsnRecord: DnsDkimFetchResult) {
	let dkimRecord = await prisma.dkimRecord.create({
		data: {
			domainSelectorPairId: dsp.id,
			value: dkimDsnRecord.value,
			firstSeenAt: dkimDsnRecord.timestamp,
			lastSeenAt: dkimDsnRecord.timestamp,
			provenanceVerified: false,
			keyType: dkimDsnRecord.keyType,
			keyData: dkimDsnRecord.keyDataBase64,
		},
	});
	console.log(`created dkim record ${recordToString(dkimRecord)} for domain/selector pair ${dspToString(dsp)}`);
	return dkimRecord;
}
