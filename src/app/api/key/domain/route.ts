import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { checkRateLimiter } from "@/lib/utils";
import { findRecordsWithCache } from "@/lib/db";
import { DomainSearchResults } from "../route";

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

    let records;
    try {
      records = await findRecordsWithCache(domain, selector);
    } catch (dbError: any) {
      console.error("Database error in findRecordsWithCache:", dbError);
      return NextResponse.json(
        { error: "Database error occurred", details: dbError.message },
        { status: 500 }
      );
    }

    let result: DomainSearchResults[];
      result = records.map((record) => ({
        domain: record.domainSelectorPair.domain,
        selector: record.domainSelectorPair.selector,
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
        value: record.value,
      }));

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Unexpected error in /api/key/domain:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }

}
