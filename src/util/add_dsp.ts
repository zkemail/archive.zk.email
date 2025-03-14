import { addDomainSelectorPair } from "@/lib/utils_server";

async function main() {
	const args = process.argv.slice(2);
	if (args.length != 2) {
		console.log('usage: pnpm tsx add_dsp.ts <domain> <selector>');
		process.exit(1);
	}
	const domain = args[0];
	const selector = args[1];
	try {
		const added = (await addDomainSelectorPair(domain, selector, 'scraper')).added;
		console.log(`domain: ${domain}, selector: ${selector}, added: ${added}`);
	}
	catch (error: any) {
		console.error(`add_dsps_from_stdin.ts error: ${error}`);
		process.exit(1);
	}
}

main();
