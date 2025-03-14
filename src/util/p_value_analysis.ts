import { prisma } from "@/lib/db";
import { parseDkimTagList } from "@/lib/utils";

async function main() {
	const dkimRecords = []
	let nextCursor = 0;
	const take = 100000;
	while (true) {
		const cursorObj = (nextCursor == 0) ? null : { cursor: { id: nextCursor } };
		const recs = await prisma.dkimRecord.findMany({
			skip: (nextCursor == 0) ? 0 : 1,
			take: take,
			...cursorObj,
			include: { domainSelectorPair: true }
		})
		console.log(`batch: found ${recs.length} records`);
		if (recs.length == 0) {
			break;
		}
		for (const r of recs) {
			dkimRecords.push(r);
		}
		nextCursor = recs[recs.length - 1].id;
	}
	console.log(`found ${dkimRecords.length} records`);

	const invalid_records_without_p = []
	const invalid_records_with_p = []
	for (const r of dkimRecords) {
		const tagList = parseDkimTagList(r.value);
		if (!tagList.hasOwnProperty('p')) {
			if (r.value.includes('p=')) {
				invalid_records_with_p.push(r);
			}
			else {
				invalid_records_without_p.push(r);
			}
		}
	}
	console.log(`found ${invalid_records_without_p.length} records that do not contain p=`);
	for (const r of invalid_records_without_p) {
		const dns = `${r.domainSelectorPair.selector}._domainkey.${r.domainSelectorPair.domain}`
		console.log(`${dns}\t${r.value}`);
	}

	console.log();
	console.log(`found ${invalid_records_with_p.length} records that contain p=, but that could not be parsed as a tag list`);
	for (const r of invalid_records_with_p) {
		const dns = `${r.domainSelectorPair.selector}._domainkey.${r.domainSelectorPair.domain}`
		console.log(`${dns}\t${r.value}`);
	}
}

main();
