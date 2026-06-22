import { type DomainAndSelector, isValidDate } from "./utils";
import { addDomainSelectorPair } from "./utils_server";

const GOOGLE_DATE_GUESS_DAYS = 7;

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

function isGoogleManagedDomain(domain: string): boolean {
	const normalized = domain.toLowerCase();
	return normalized === 'gmail.com'
		|| normalized.endsWith('.gmail.com')
		|| normalized === 'google.com'
		|| normalized.endsWith('.google.com')
		|| normalized === 'googlemail.com'
		|| normalized.endsWith('.googlemail.com')
		|| normalized === 'googlegroups.com'
		|| normalized.endsWith('.googlegroups.com')
		|| normalized === 'gappssmtp.com'
		|| normalized.endsWith('.gappssmtp.com');
}

function candidateDates(domain: string, newDate: Date): Date[] {
	const days = isGoogleManagedDomain(domain) ? GOOGLE_DATE_GUESS_DAYS : 1;
	return Array.from({ length: days }, (_, index) => {
		const date = new Date(newDate);
		date.setDate(newDate.getDate() - index);
		return date;
	});
}

function yearPattern(domain: string, newDate: Date): string {
	if (isGoogleManagedDomain(domain)) {
		return `(\\d{4})`;
	}
	const y0 = newDate.getFullYear().toString();
	const y1 = (newDate.getFullYear() - 1).toString();
	const y2 = (newDate.getFullYear() - 2).toString();
	return `(${y0}|${y1}|${y2})`;
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

function uniqueAlternatives(domain: string, selector: string, alternatives: DomainAndSelector[]): DomainAndSelector[] {
	const seen = new Set<string>();
	return alternatives.filter(alternative => {
		if (alternative.domain === domain && alternative.selector === selector) {
			return false;
		}
		const key = `${alternative.domain}\t${alternative.selector}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

export function findAlternatives(domain: string, selector: string, newDate: Date): DomainAndSelector[] {
	const alternatives: DomainAndSelector[] = [];
	const domainYearPattern = yearPattern(domain, newDate);
	for (const date of candidateDates(domain, newDate)) {
		findYYYYMMDD(domain, selector, domainYearPattern, alternatives, date);
		findAABBYYYY(domain, selector, domainYearPattern, alternatives, date);
	}
	return uniqueAlternatives(domain, selector, alternatives);
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
