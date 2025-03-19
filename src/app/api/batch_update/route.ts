import { prisma, updateDspTimestamp } from '@/lib/db';
import { guessSelectors } from '@/lib/selector_guesser';
import { fetchAndStoreDkimDnsRecord } from '@/lib/utils_server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
	const authHeader = request.headers.get('authorization');
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return new Response('Unauthorized', { status: 401 });
	}

	const numRecords = Number(request.nextUrl.searchParams.get('batch_size') || '10');
	try {
		const oneDayAgo = new Date(Date.now() - 1000 * 60 * 60 * 24);
		const dsps = await prisma.domainSelectorPair.findMany(
			{
				where: { lastRecordUpdate: { lte: oneDayAgo } },
				orderBy: { lastRecordUpdate: 'asc' },
				take: numRecords,
			}
		);
		console.log(`found ${dsps.length} records to update, max limit: ${numRecords}`);
		const addedAlternatives = [];
		for (const dsp of dsps) {
			try {
				await fetchAndStoreDkimDnsRecord(dsp);
				const now = new Date();
				updateDspTimestamp(dsp, now);
				addedAlternatives.push(... await guessSelectors(dsp.domain, dsp.selector, now));
			}
			catch (error) {
				console.log(`error updating ${dsp.domain}, ${dsp.selector}: ${error}`);
				throw error;
			}
		}
		return NextResponse.json({ updatedRecords: dsps, addedAlternatives }, { status: 200 });
	}
	catch (error: any) {
		return NextResponse.json(error.toString(), { status: 500 });
	}
}