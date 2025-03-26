import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { parseDkimTagList } from "@/lib/utils";
import { readFileSync } from "node:fs";


export async function findKnownKeys(domain: string, selector: string) {
	const records = await prisma.dkimRecord.findMany({
		where: {
			domainSelectorPair: {
				AND: [
					{
						domain: {
							equals: domain,
							mode: Prisma.QueryMode.insensitive,
						}
					},
					{
						selector: {
							equals: selector,
							mode: Prisma.QueryMode.insensitive,
						}
					}
				]
			}
		},
		include: {
			domainSelectorPair: true
		}
	});
	const result = [];
	for (const record of records) {
		const p = parseDkimTagList(record.value).p;
		if (p) {
			result.push(p);
		}
		else {
			console.log(`skip known key with empty/invalid value for domain: ${domain}, selector: ${selector}, record: ${record.value}`);
		}
	}
	return result;
}

type SolveResult = {
	tvl: string,
	sources: string[],
};

type DspAndKeys = {
	domain: string,
	selector: string,
	solve_results: SolveResult[],
};

type DspToKeysMap = {
	[dsp_index: string]: DspAndKeys,
};

async function main() {
	console.log('reading DSPs from stdin');
	const previouslyUnseenKeysFound: [string, string, string, string][] = [];
	const solvedKeysNotMatchingArchive: [string, string, string, string][] = [];
	const solvedKeysMatchingArchive: [string, string, string, string][] = [];
	const notSolved: [string, string, string][] = [];

	const args = process.argv.slice(2);
	if (args.length == 1) {
		const filename = args[0];
		console.log(`reading DSPs from file: ${filename}`);
		const fileContent = readFileSync(filename, 'utf8');
		const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line);
		const dspToKeysMap: DspToKeysMap = {};
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const [dsp_index, domain, selector, solved_key_tvl, source1, source2] = line.split('\t');
			if (!dspToKeysMap[dsp_index]) {
				dspToKeysMap[dsp_index] = { domain, selector, solve_results: [] };
			}
			dspToKeysMap[dsp_index].solve_results.push({ tvl: solved_key_tvl, sources: [source1, source2] });
		}

		for (const dsp_index in dspToKeysMap) {

			const { domain, selector, solve_results } = dspToKeysMap[dsp_index];
			const sources = solve_results.map(key => key.sources).join(', ');
			const validKeys = []
			for (const r of solve_results) {
				if (r.tvl !== '-') {
					validKeys.push(r);
				}
			}
			if (validKeys.length == 0) {
				notSolved.push([domain, selector, sources]);
			}

			if (solve_results.map(key => key.tvl).includes('-') && validKeys.length > 0) {
				console.log(`results for some but not all message pairs for ${domain}, ${selector}: ${JSON.stringify(solve_results)}`);
				continue;
			}

			const allKeysAreSame = validKeys.every(key => key === validKeys[0]);
			if (!allKeysAreSame) {
				console.log(`differing keys for ${domain}, ${selector}: ${JSON.stringify(validKeys)}`);
			}

			const solved_key = solve_results[0];
			if (solved_key.tvl === '-') {
				//console.log(`skip DSP with empty key for domain: ${domain}, selector: ${selector}`);
				continue;
			}

			const key_der_format = parseDkimTagList(solved_key.tvl).p;
			const knownKeys = await findKnownKeys(domain, selector);
			if (knownKeys.length == 0) {
				previouslyUnseenKeysFound.push([domain, selector, solved_key.tvl, sources]);
			}
			else {
				if (knownKeys.includes(key_der_format)) {
					solvedKeysMatchingArchive.push([domain, selector, solved_key.tvl, sources]);
				}
				else {
					solvedKeysNotMatchingArchive.push([domain, selector, solved_key.tvl, sources]);
				}
			}
			console.log(`${dsp_index}, previouslyUnseenKeysFound: ${previouslyUnseenKeysFound.length}, solvedKeysMatchingArchive: ${solvedKeysMatchingArchive.length}, solvedKeysNotMatchingArchive: ${solvedKeysNotMatchingArchive.length}`);
		}


		console.log();
		console.log(`solved keys for which there are no keys in the archive for the corresponding DSP: ${previouslyUnseenKeysFound.length}`);
		for (const [domain, selector, result, sources] of previouslyUnseenKeysFound) {
			console.log(`${domain}\t${selector}\t${result}\t${sources}`);
		}
		console.log();
		console.log(`solved keys which match a key in the archive: ${solvedKeysMatchingArchive.length}`);
		for (const [domain, selector, key, sources] of solvedKeysMatchingArchive) {
			console.log(`${domain}\t${selector}\t${key}\t${sources}`);
		}
		console.log();
		console.log(`solved keys for which there are keys in the archive for the corresponding DSP, but no match: ${solvedKeysNotMatchingArchive.length}`);
		for (const [domain, selector, result, sources] of solvedKeysNotMatchingArchive) {
			console.log(`${domain}\t${selector}\t${result}\t${sources}`);
		}

		console.log();
		console.log(`DSPs for which no keys were solved: ${notSolved.length}`);
		for (const [domain, selector, sources] of notSolved) {
			console.log(`${domain}\t${selector}\t${sources}`);
		}
	}
}

main();
