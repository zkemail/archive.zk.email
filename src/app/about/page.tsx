import { prisma } from "@/lib/db";
import Link from "next/link";
import React from "react";

export const revalidate = 60;

type ArchiveStats =
	| {
			available: true;
			uniqueDomains: string;
			uniqueSelectors: string;
			domainSelectorPairs: number;
			dkimKeys: number;
	  }
	| { available: false };

async function getArchiveStats(): Promise<ArchiveStats> {
	try {
		// https://github.com/prisma/prisma/issues/4228
		type CountResult = [{ count: bigint }];
		const [uniqueDomainsCount] = await prisma.$queryRaw`SELECT COUNT(DISTINCT domain) FROM "DomainSelectorPair";` as CountResult;
		const [uniqueSelectorsCount] = await prisma.$queryRaw`SELECT COUNT(DISTINCT selector) FROM "DomainSelectorPair";` as CountResult;

		return {
			available: true,
			uniqueDomains: uniqueDomainsCount.count.toString(),
			uniqueSelectors: uniqueSelectorsCount.count.toString(),
			domainSelectorPairs: await prisma.domainSelectorPair.count(),
			dkimKeys: await prisma.dkimRecord.count(),
		};
	} catch (error) {
		console.error("Failed to load archive statistics", error);
		return { available: false };
	}
}

export default async function Page() {
	const stats = await getArchiveStats();

	return (
		<div>
			<h1>About</h1>
			<p>
				The website lets you search for a domain and returns archived DKIM selectors and keys for that domain.
				The site is a part of the <a href="https://prove.email/">Proof of Email</a> project.
			</p>
			<p>
				On the <Link href="/contribute">Contribute</Link> page, users can contribute with new domains and selectors,
				which are extracted from the DKIM-Signature header field in each email message in the user's Gmail account.
				When domains and selectors are added, the site fetches the DKIM key via DNS and stores it in the database.
			</p>
			<p>
				For each record, the site also generates an on-chain proof with <a href="https://witness.co/">Witness</a>, which functions as a data availability timestamp.
			</p>

			<h2>Statistics</h2>
			{stats.available ? (
				<>
					<p>Unique domains: {stats.uniqueDomains}</p>
					<p>Unique selectors: {stats.uniqueSelectors}</p>
					<p>Domain/selector-pairs: {stats.domainSelectorPairs}</p>
					<p>DKIM keys: {stats.dkimKeys}</p>
				</>
			) : (
				<p>Archive statistics are temporarily unavailable.</p>
			)}
		</div >
	)
}
