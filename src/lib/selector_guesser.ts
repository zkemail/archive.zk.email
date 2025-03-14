import { type DomainAndSelector, isValidDate } from "./utils";
import { addDomainSelectorPair } from "./utils_server";

function dateToYYYYMMDD(date: Date): string {
	return `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
}

function dateToMMDDYYYY(date: Date): string {
	return `${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}${date.getFullYear()}`;
}

function dateToDDMMYYYY(date: Date): string {
	return `${date.getDate().toString().padStart(2, '0')}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getFullYear()}`;
}

function getAlternativeDsp(domain: string, selector: string, oldDate: string, newDate: string): DomainAndSelector {
	const newSelector = selector.replace(oldDate, newDate);

	// For some domains, the date is also a part of the domain, and thus the domain must be updated as well.
	// Example: selector: 20230601, domain: zkhack-dev.20230601.gappssmtp.com
	// In some cases, the DNS server even ignores the value of the selector,
	// returning the same DKIM key for any selector value.
	const newDomain = domain.replace(oldDate, newDate);

	return { domain: newDomain, selector: newSelector };
}

function findYYYYMMDD(domain: string, selector: string, yearPattern: string, alternatives: DomainAndSelector[], newDate: Date) {
	const re = new RegExp(`${yearPattern}(\\d{2})(\\d{2})`);
	const match = selector.match(re);
	if (match && match.index !== undefined) {
		// the alternative interpretation YYYYDDMM is not an established format anywhere in the world,
		// so we ignore that for simplicity
		// (see https://en.wikipedia.org/wiki/List_of_date_formats_by_country)
		const oldDateStr = match[0];
		const [year, month, day] = match.slice(1).map(s => Number.parseInt(s));
		if (!isValidDate(year, month, day)) {
			return;
		}
		const newDateStr = dateToYYYYMMDD(newDate);
		alternatives.push(getAlternativeDsp(domain, selector, oldDateStr, newDateStr));
	}
}

function findAABBYYYY(domain: string, selector: string, yearPattern: string, alternatives: DomainAndSelector[], newDate: Date) {
	const re = new RegExp(`(\\d{2})(\\d{2})${yearPattern}`);
	const match = selector.match(re);
	if (match && match.index !== undefined) {
		const oldDateStr = match[0];
		const [aa, bb, year] = match.slice(1).map(s => Number.parseInt(s));
		if (isValidDate(year, aa, bb)) {
			const newDateStr = dateToMMDDYYYY(newDate);
			alternatives.push(getAlternativeDsp(domain, selector, oldDateStr, newDateStr));
		}
		if (isValidDate(year, bb, aa)) {
			const newDateStr = dateToDDMMYYYY(newDate);
			alternatives.push(getAlternativeDsp(domain, selector, oldDateStr, newDateStr));
		}
	}
}

export function findAlternatives(domain: string, selector: string, newDate: Date): DomainAndSelector[] {
	const alternatives: DomainAndSelector[] = [];
	const y0 = newDate.getFullYear().toString();
	const y1 = (newDate.getFullYear() - 1).toString();
	const y2 = (newDate.getFullYear() - 2).toString();
	const yearPattern = `(${y0}|${y1}|${y2})`;
	findYYYYMMDD(domain, selector, yearPattern, alternatives, newDate);
	findAABBYYYY(domain, selector, yearPattern, alternatives, newDate);
	return alternatives;
}

export async function guessSelectors(domain: string, selector: string, newDate: Date) {
	const alternatives = findAlternatives(domain, selector, newDate);
	const addedAlternatives = [];
	for (const altDsp of alternatives) {
		console.log(`trying guessed alternative ${JSON.stringify(altDsp)}`);
		if ((await addDomainSelectorPair(altDsp.domain, altDsp.selector, 'selector_guesser')).added) {
			console.log(`added guessed alternative ${JSON.stringify(altDsp)}`);
			addedAlternatives.push(altDsp);
		}
	}
	return addedAlternatives;
}
