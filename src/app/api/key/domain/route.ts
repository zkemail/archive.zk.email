import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { checkRateLimiter } from "@/lib/utils";
import { findRecordsWithCache, type RecordWithSelector } from "@/lib/db";
import { DomainSearchResults } from "../route";
import { fetchDkimDnsRecord, addDomainSelectorPair } from "@/lib/utils_server";

const rateLimiter = new RateLimiterMemory({ points: 2000, duration: 1 });

export async function GET(req: Request) {
  try {
    await checkRateLimiter(rateLimiter, headers(), 1);
  } catch (error: any) {
    return NextResponse.json("Rate limit exceeded", { status: 429 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get("domain");
    const selector = searchParams.get("selector") || undefined;

    if (!domain) {
      return NextResponse.json("missing domain parameter", { status: 400 });
    }

    // Fetch from database
    let dbRecords: RecordWithSelector[] = [];
    try {
      dbRecords = await findRecordsWithCache(domain, selector);
    } catch (dbError: any) {
      console.error("Database error in findRecordsWithCache:", dbError);
      return NextResponse.json(
        { error: "Database error", details: "Failed to fetch records from archive" },
        { status: 500 }
      );
    }

    // Convert DB records to result format
    const dbResults: DomainSearchResults[] = dbRecords.map((record) => ({
      domain: record.domainSelectorPair.domain,
      selector: record.domainSelectorPair.selector,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      value: record.value,
    }));

    // If selector is provided, also fetch from DNS
    let dnsResults: DomainSearchResults[] = [];
    if (selector) {
      try {
        const dnsRecords = await fetchDkimDnsRecord(domain, selector);
        dnsResults = dnsRecords.map((record) => ({
          domain: record.domain,
          selector: record.selector,
          firstSeenAt: record.timestamp,
          lastSeenAt: record.timestamp,
          value: record.value,
        }));

        // Async call to add DSP to database (fire and forget)
        if (dnsRecords.length > 0) {
          addDomainSelectorPair(domain, selector, "api").catch((err) => {
            console.error("Error adding DSP asynchronously:", err);
          });
        }
      } catch (dnsError: any) {
        console.error("DNS fetch error:", dnsError);
        // Continue with DB results only
      }
    }

    // Combine results, avoiding duplicates based on value
    const seenValues = new Set(dbResults.map((r) => r.value));
    const combinedResults = [
      ...dbResults,
      ...dnsResults.filter((r) => !seenValues.has(r.value)),
    ];

    return NextResponse.json(combinedResults, { status: 200 });
  } catch (error: any) {
    console.error("Unexpected error in /api/key/domain:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }

}
