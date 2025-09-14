import {
  PrismaClient,
  Prisma,
  type DkimRecord,
  type DomainSelectorPair,
} from "@prisma/client";
import { fetchJsonWebKeySet, fetchx509Cert, DnsDkimFetchResult } from "./utils";
import { LRUCache } from "lru-cache";

// In process Cache configuration (LRU cache)
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_SIZE = 1000; // Maximum 1000 entries

// Create LRU cache instances
const domainCache = new LRUCache<string, RecordWithSelector[]>({
  max: CACHE_MAX_SIZE,
  ttl: CACHE_TTL,
});

const domainSelectorCache = new LRUCache<string, RecordWithSelector[]>({
  max: CACHE_MAX_SIZE,
  ttl: CACHE_TTL,
});

// Cache for DomainSelectorPair IDs to avoid repeated lookups
const DSP_ID_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day
const dspIdCache = new LRUCache<string, number>({
  max: CACHE_MAX_SIZE,
  ttl: DSP_ID_CACHE_TTL,
});

const createPrismaClient = () => {
	const prismaUrl = new URL(process.env.POSTGRES_PRISMA_URL as string);
	
	// Optimize connection pooling parameters
	prismaUrl.searchParams.set('connection_limit', '20');        // Max connections
	prismaUrl.searchParams.set('pool_timeout', '10');            // Pool acquire timeout (seconds)
	prismaUrl.searchParams.set('connect_timeout', '10');         // Connection timeout
	prismaUrl.searchParams.set('socket_timeout', '30');         // Query timeout
	
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

  clearRecordsCache(dsp.domain, dsp.selector);

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

  clearRecordsCache(dsp.domain, dsp.selector);
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

// Helper function to generate cache keys
function generateCacheKey(domain: string, selector?: string): string {
  return selector ? `${domain}:${selector}` : domain;
}

const inFlightRequests = new Map<string, Promise<RecordWithSelector[]>>();

export async function findRecordsWithCache(
  domain: string,
  selector?: string
): Promise<RecordWithSelector[]> {
  // Normalize inputs to lowercase
  const domainNorm = domain.toLowerCase();
  const selectorNorm = selector?.toLowerCase();
  
  const cacheKey = generateCacheKey(domainNorm, selectorNorm);
  const cache = selector ? domainSelectorCache : domainCache;

  // Try to get from cache first
  const cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  // De-duplicate concurrent misses
  const inflight = inFlightRequests.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  // Cache miss: fetch from database

  const p = (async () => {
    // Minimal timing to avoid console overhead in hot path
    
    if (selectorNorm) {
      // STEP 1: Try in-memory DSP id cache first
      const dspIdKey = generateCacheKey(domainNorm, selectorNorm);
      let dspId = dspIdCache.get(dspIdKey);
      if (!dspId) {
        const dsp = await prisma.domainSelectorPair.findFirst({
          where: { domain: domainNorm, selector: selectorNorm },
          select: { id: true },
        });
        if (!dsp) {
          cache.set(cacheKey, []);
          return [];
        }
        dspId = dsp.id;
        dspIdCache.set(dspIdKey, dspId);
      }
      
      // STEP 2: Get DkimRecords by ID
      const dkimRecords = await prisma.dkimRecord.findMany({
        where: { domainSelectorPairId: dspId },
        select: { firstSeenAt: true, lastSeenAt: true, value: true },
      });
      
      // Filter and combine (use normalized domain/selector)
      const filtered = dkimRecords.filter(record => record.value !== "p=");
      const result = filtered.map(record => ({
        ...record,
        domainSelectorPair: { domain: domainNorm, selector: selectorNorm },
      })) as unknown as RecordWithSelector[];
      
      cache.set(cacheKey, result);
      return result;
      
    } else {
      // Domain-only path (same detailed logging)
      const dsps = await prisma.domainSelectorPair.findMany({
        where: { domain: domainNorm },
        select: { id: true, domain: true, selector: true },
      });
      
      if (dsps.length === 0) {
        cache.set(cacheKey, []);
        return [];
      }
      
      const dkimRecords = await prisma.dkimRecord.findMany({
        where: { domainSelectorPairId: { in: dsps.map(dsp => dsp.id) } },
        select: { domainSelectorPairId: true, firstSeenAt: true, lastSeenAt: true, value: true },
      });
      
      const dspMap = new Map(dsps.map(dsp => [dsp.id, dsp]));
      const filtered = dkimRecords.filter(record => record.value !== "p=");
      const result = filtered.map(record => {
        const dsp = dspMap.get(record.domainSelectorPairId)!;
        return {
          firstSeenAt: record.firstSeenAt,
          lastSeenAt: record.lastSeenAt,
          value: record.value,
          domainSelectorPair: { domain: dsp.domain, selector: dsp.selector },
        };
      }) as unknown as RecordWithSelector[];
            
      cache.set(cacheKey, result);
      return result;
    }
  })();

  inFlightRequests.set(cacheKey, p);
  try {
    return await p;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

// Function to clear cache when data is updated
export function clearRecordsCache(domain?: string, selector?: string) {
  if (domain && selector) {
    const cacheKey = generateCacheKey(domain, selector);
    domainSelectorCache.delete(cacheKey);
    domainCache.delete(domain);
    dspIdCache.delete(cacheKey);
  } else if (domain) {
    domainCache.delete(domain);
    for (const key of domainSelectorCache.keys()) {
      if (key.startsWith(domain + ":")) {
        domainSelectorCache.delete(key);
      }
    }
    for (const key of dspIdCache.keys()) {
      if (key.startsWith(domain + ":")) {
        dspIdCache.delete(key);
      }
    }
  } else {
    domainCache.clear();
    domainSelectorCache.clear();
    dspIdCache.clear();
  }
}
