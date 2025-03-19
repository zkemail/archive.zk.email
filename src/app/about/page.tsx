import { prisma } from "@/lib/db";
import React from "react";

export const revalidate = 60;

export default async function Page() {

	// https://github.com/prisma/prisma/issues/4228
	type CountResult = [{ count: bigint }]
	const [uniqueDomainsCount] = await prisma.$queryRaw`SELECT COUNT(DISTINCT domain) FROM "DomainSelectorPair";` as CountResult;
	const [uniqueSelectorsCount] = await prisma.$queryRaw`SELECT COUNT(DISTINCT selector) FROM "DomainSelectorPair";` as CountResult;

	const domainSelectorPairCount = await prisma.domainSelectorPair.count();
	const dkimKeyCount = await prisma.dkimRecord.count();

	return (
		<div>
			<h1>About</h1>
			<p>
				The website lets you search for a domain and returns archived DKIM selectors and keys for that domain.
				The site is a part of the <a href="https://prove.email/">Proof of Email</a> project.
			</p>
			<p>
				On the <a href="contribute">Contribute</a> page, users can contribute with new domains and selectors,
				which are extracted from the DKIM-Signature header field in each email message in the user's Gmail account.
				When domains and selectors are added, the site fetches the DKIM key via DNS and stores it in the database.
			</p>
			<p>
				For each record, the site also generates an on-chain proof with <a href="https://witness.co/">Witness</a>, which functions as a data availability timestamp.
			</p>

			<h2>Statistics</h2>
			<p>
				Unique domains: {uniqueDomainsCount.count.toString()}
			</p>
			<p>
				Unique selectors: {uniqueSelectorsCount.count.toString()}
			</p>
			<p>
				Domain/selector-pairs: {domainSelectorPairCount}
			</p>
			<p>
				DKIM keys: {dkimKeyCount}
			</p>
		</div >
	)
}
