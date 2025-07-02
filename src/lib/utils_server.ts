import { type DomainSelectorPair, Prisma } from "@prisma/client";
import { createDkimRecord, dspToString, prisma, recordToString, updateDspTimestamp } from "./db";
import { generateWitness } from "./generateWitness";
import { type DnsDkimFetchResult, type DspSourceIdentifier, kValueToKeyType, parseDkimTagList } from "./utils";
import dns from 'dns';
import type { KeyType } from "@prisma/client";
import { execFileSync } from "node:child_process";

async function refreshKeysFromDns(dsp: DomainSelectorPair) {
	const now = new Date();
	const oneHourAgo = new Date(now.getTime() - 1000 * 60 * 60);
	if (!dsp.lastRecordUpdate || dsp.lastRecordUpdate < oneHourAgo) {
		console.log(`refresh key for ${dspToString(dsp)}`);
		await fetchAndStoreDkimDnsRecord(dsp);
		updateDspTimestamp(dsp, new Date());
	}
}

export type AddResult = {
	already_in_db: boolean;
	added: boolean;
}

export type processResult = { success: boolean; message: string; }[] | { processResultError: string; } | undefined;
/**
 * @returns true iff a record was added
 */
export async function addDomainSelectorPair(domain: string, selector: string, sourceIdentifier: DspSourceIdentifier): Promise<AddResult> {

	domain = domain.toLowerCase();
	selector = selector.toLowerCase();

	// check if record exists
	const dsp = await prisma.domainSelectorPair.findFirst({
		where: {
			domain: {
				equals: domain,
				mode: Prisma.QueryMode.insensitive,
			},
			selector: {
				equals: selector,
				mode: Prisma.QueryMode.insensitive
			}
		}
	});
	if (dsp) {
		console.log(`found domain/selector pair ${dspToString(dsp)}`);
		await refreshKeysFromDns(dsp);
		return { already_in_db: true, added: false };
	}
	const records = await fetchDkimDnsRecord(domain, selector);
	if (records.length === 0) {
		console.log(`no dkim dns record found for ${selector}, ${domain}`);
		return { already_in_db: false, added: false };
	}
	console.log(`found ${records.length} dkim dns records for ${selector}, ${domain}, adding DSP and records`);

	const newDsp = await prisma.domainSelectorPair.create({
		data: {
			domain,
			selector,
			sourceIdentifier,
			lastRecordUpdate: new Date(),
			records: {
				create: [...records.map(record => ({
					value: record.value,
					firstSeenAt: record.timestamp,
					lastSeenAt: record.timestamp,
					provenanceVerified: false,
					keyType: record.keyType,
					keyData: record.keyDataBase64,
				}))]
			}
		},
		include: {
			records: true
		}
	})
	newDsp.records.forEach(record => {
		generateWitness(newDsp, record);
	});
	return { already_in_db: false, added: true };
}

async function runCommand(file: string, args: string[], input: Buffer) {
	console.log(`running ${file} ${args.join(' ')}`);
	try {
		const result = execFileSync(file, args, { input });
		return result.toString();
	}
	catch (error) {
		console.log(`error running ${file} ${args.join(' ')}: ${error}`);
		return null;
	}
}

// return key info if the key is valid, othwerwise raise an exception
async function decodeKeyInfo(dkimRecordTsv: string): Promise<{ keyType: KeyType, keyDataBase64: string | null }> {
	const tagValues = parseDkimTagList(dkimRecordTsv);
	console.log(`tagValues: ${JSON.stringify(tagValues)}`);
	const keyType = kValueToKeyType(tagValues['k']);
	if (!tagValues.hasOwnProperty('p')) {
		throw `no p= tag found in dkim record`;
	}
	const p_base64 = tagValues['p'].trim();
	if (p_base64 === '') {
		console.log(`empty p= tag found in dkim record`);
		// an empty p= tag is allowed and means that the key is revoked, see https://datatracker.ietf.org/doc/html/rfc6376#section-3.6.1
		return { keyType, keyDataBase64: '' };
	}

	const p_binary = Buffer.from(p_base64, 'base64');
	if (keyType === 'RSA') {
		console.log(`running openssl asn1parse on RSA key`);
		const asn1parse_output = await runCommand('/usr/bin/env', ['openssl', 'asn1parse', '-inform', 'DER'], p_binary);
		if (!asn1parse_output) {
			throw `error running openssl asn1parse on RSA key`;
		}
		console.log(`openssl output: ${JSON.stringify(asn1parse_output)}`);

		// p_base64 may contain non-base64 characters, which are ignored by Buffer.from
		const p_base64_normalized = p_binary.toString('base64');
		return { keyType, keyDataBase64: p_base64_normalized };
	} else {
		return { keyType, keyDataBase64: null };
	}
}

export async function fetchDkimDnsRecord(domain: string, selector: string): Promise<DnsDkimFetchResult[]> {
	const resolver = new dns.promises.Resolver({ timeout: 2500 });
	const qname = `${selector}._domainkey.${domain}`;
	let records;
	try {
		records = (await resolver.resolve(qname, 'TXT')).map(record => record.join(''));
	}
	catch (error) {
		try {
			console.log(`[DNS] System DNS failed for ${qname}: ${error}. Falling back to `);
			resolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1']);
			records = (await resolver.resolve(qname, 'TXT')).map(record => record.join(''));
		}
		catch (error) {
			console.log(`[DNS] All DNS servers failed for ${qname}: ${error}.`);
			return [];
		}
	}
	console.log(`found: ${records.length} records for ${qname}`);
	const result = [];
	for (const record of records) {
		console.log(`record: ${record}`);
		console.log(`found dns record for ${qname}`);
		try {
			const { keyType, keyDataBase64 } = await decodeKeyInfo(record);
			console.log(`keyType: ${keyType}, keyDataBase64: ${keyDataBase64}`);
			const dkimRecord: DnsDkimFetchResult = {
				selector,
				domain,
				value: record,
				timestamp: new Date(),
				keyType,
				keyDataBase64
			};
			result.push(dkimRecord);
		}
		catch (error) {
			console.log(`error decoding record: ${error}`);
		}

	}
	return result
}

/**
 * @returns true iff a record was added
 */
export async function fetchAndStoreDkimDnsRecord(dsp: DomainSelectorPair) {
	console.log(`fetching ${dsp.selector}._domainkey.${dsp.domain} from dns`);
	const dnsRecords = await fetchDkimDnsRecord(dsp.domain, dsp.selector);
	for (const dnsRecord of dnsRecords) {
		let dbRecord = await prisma.dkimRecord.findFirst({
			where: {
				domainSelectorPair: dsp,
				value: dnsRecord.value
			},
		});

		if (dbRecord) {
			console.log(`record already exists: ${recordToString(dbRecord)} for domain/selector pair ${dspToString(dsp)}, updating lastSeenAt to ${dnsRecord.timestamp}`);
			await prisma.dkimRecord.update({
				where: { id: dbRecord.id },
				data: { lastSeenAt: dnsRecord.timestamp }
			});
		}
		else {
			dbRecord = await createDkimRecord(dsp, dnsRecord);
		}

		if (!dbRecord.provenanceVerified) {
			generateWitness(dsp, dbRecord);
		}
	}
}

export function pubKeyLength(signature: any) {
	let minBytes = Buffer.from(signature || '', 'base64').length;
	const candidates = [128, 256, 512, 1024];
	for (const candidate of candidates) {
		if (minBytes <= candidate) {
			return candidate;
		}
	}
	return minBytes;
}

