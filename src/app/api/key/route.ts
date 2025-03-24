import { findRecords } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { checkRateLimiter } from "@/lib/utils";

export type DomainSearchResults = {
  domain: string;
  selector: string;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  value: string;
};

const rateLimiter = new RateLimiterMemory({ points: 1000, duration: 1 });

export async function GET(request: NextRequest) {
  try {
    await checkRateLimiter(rateLimiter, headers(), 1);
  } catch (error: any) {
    return NextResponse.json("Rate limit exceeded", { status: 429 });
  }

  try {
    const domainName = request.nextUrl.searchParams.get("domain");
    const selector = request.nextUrl.searchParams.get("selector");

    if (!domainName) {
      return NextResponse.json("missing domain parameter", { status: 400 });
    }

    let records = await findRecords(domainName);

    // Filter by selector if provided
    if (selector) {
      records = records.filter(
        (record) => record.domainSelectorPair.selector === selector
      );
    }

    let result: DomainSearchResults[] = records.map((record) => ({
      domain: record.domainSelectorPair.domain,
      selector: record.domainSelectorPair.selector,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      value: record.value,
    }));

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(error.toString(), { status: 500 });
  }
}
