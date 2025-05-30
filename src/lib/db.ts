import {
  PrismaClient,
  Prisma,
  type DkimRecord,
  type DomainSelectorPair,
} from "@prisma/client";
import { fetchJsonWebKeySet, fetchx509Cert, DnsDkimFetchResult } from "./utils";

const createPrismaClient = () => {
	const prismaUrl = new URL(process.env.POSTGRES_PRISMA_URL as string);
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
  var prismaClient: undefined | ReturnType<typeof createPrismaClient>;
}
export const prisma = globalThis.prismaClient ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.prismaClient = prisma;
}

export type RecordWithSelector = DkimRecord & {
  domainSelectorPair: DomainSelectorPair;
};

export async function findRecords(
  domainQuery: string
): Promise<RecordWithSelector[]> {
  return await prisma.dkimRecord.findMany({
    where: {
      domainSelectorPair: {
        OR: [
          {
            domain: {
              equals: domainQuery,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            domain: {
              endsWith: "." + domainQuery,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      },
      value: {
        not: {
          equals: "p=",
        },
      },
    },
    include: {
      domainSelectorPair: true,
    },
  });
}

export function dspToString(dsp: DomainSelectorPair): string {
  return `#${dsp.id}, ${dsp.domain}, ${dsp.selector}`;
}

export function recordToString(record: DkimRecord): string {
  const value = record.value;
  const maxLen = 50;
  const valueTruncated =
    value.length > maxLen ? value.slice(0, maxLen - 1) + "…" : value;
  return `#${record.id}, "${valueTruncated}"`;
}

export async function updateDspTimestamp(
  dsp: DomainSelectorPair,
  timestamp: Date
) {
  const updatedSelector = await prisma.domainSelectorPair.update({
    where: {
      id: dsp.id,
    },
    data: {
      lastRecordUpdate: timestamp,
    },
  });
  console.log(`updated dsp timestamp ${dspToString(updatedSelector)}`);
}

export async function createDkimRecord(
  dsp: DomainSelectorPair,
  dkimDsnRecord: DnsDkimFetchResult
) {
  const dkimRecord = await prisma.dkimRecord.create({
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
  console.log(
    `created dkim record ${recordToString(
      dkimRecord
    )} for domain/selector pair ${dspToString(dsp)}`
  );
  return dkimRecord;
}

export async function getLastJWKeySet() {
  try {
    const lastJwtKey = await prisma.jsonWebKeySets.findFirst({
      orderBy: {
        lastUpdated: "desc",
      },
    });

    return lastJwtKey;
  } catch (error) {
    console.error("Error fetching the last JWT key:", error);
  }
}

export async function updateJWKeySet() {
  try {
    const lastJWKeySet = await getLastJWKeySet();
    const latestx509Cert = await fetchx509Cert();
    const latestJsonWebKeySet = await fetchJsonWebKeySet();
    if (latestx509Cert == "" || latestJsonWebKeySet == "") {
      console.error("Error fetching latest keys");
	  return;
    }
    if (lastJWKeySet?.x509Certificate != latestx509Cert) {
      return await prisma.jsonWebKeySets.create({
        data: {
          jwks: latestJsonWebKeySet,
          x509Certificate: latestx509Cert,
          provenanceVerified: false,
        },
      });
    } else {
      return await prisma.jsonWebKeySets.update({
        where: {
          id: lastJWKeySet.id,
        },
        data: {
          lastUpdated: new Date(),
        },
      });
    }
  } catch (error) {
    console.error("Error updating the JWT key:", error);
  }
}

export async function getJWKeySetRecord() {
  const jwkSetRecord = await prisma.jsonWebKeySets.findMany();
  return jwkSetRecord;
}
