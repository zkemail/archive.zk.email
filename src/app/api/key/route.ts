import { findRecords } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { checkRateLimiter } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { refreshKeysFromDns } from "@/lib/utils_server";

export type DomainSearchResults = {
	domain: string;
	selector: string;
	firstSeenAt: Date | null;
	lastSeenAt: Date | null;
	value: string;
};

const rateLimiter = new RateLimiterMemory({ points: 5, duration: 10 });

export async function GET(request: NextRequest) {
	try {
		await checkRateLimiter(rateLimiter, headers(), 1);
	}
	catch (error: any) {
		return NextResponse.json('Rate limit exceeded', { status: 429 });
	}

	try {
		const domainName = request.nextUrl.searchParams.get('domain');
		const selectorName = request.nextUrl.searchParams.get('selector');
		if (!domainName) {
			return NextResponse.json('missing domain parameter', { status: 400 });
		}

		// Fetch domain/selector pair(s) and refresh DNS records
		const where = selectorName 
			? { domain: domainName, selector: selectorName }
			: { domain: domainName };
		const dsps = await prisma.domainSelectorPair.findMany({ where });

		// Refresh DNS records for the found pair(s)
		for (const dsp of dsps) {
			await refreshKeysFromDns(dsp);
		}

		// Now fetch the updated records
		let records = await findRecords(domainName, selectorName || undefined);
		let result: DomainSearchResults[] = records.map((record) => ({
			domain: record.domainSelectorPair.domain,
			selector: record.domainSelectorPair.selector,
			firstSeenAt: record.firstSeenAt,
			lastSeenAt: record.lastSeenAt,
			value: record.value
		}));
		return NextResponse.json(result, { status: 200 });
	}
	catch (error: any) {
		return NextResponse.json(error.toString(), { status: 500 });
	}
}
