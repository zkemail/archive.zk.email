import { findRecordsWithCache } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { checkRateLimiter } from "@/lib/utils";

export type RecordSource = "dns" | "database" | "both";

export type DomainSearchResults = {
  domain: string;
  selector: string;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  value: string;
};

const rateLimiter = new RateLimiterMemory({ points: 200, duration: 60 });

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

    const records = await findRecordsWithCache(domainName, selector ?? undefined);

    const result: DomainSearchResults[] = records.map((record) => ({
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
