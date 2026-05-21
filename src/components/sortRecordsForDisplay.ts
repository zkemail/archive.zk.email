import type { RecordWithSelector } from "@/lib/db";

function compareText(a: string | undefined, b: string | undefined): number {
	return (a ?? "").localeCompare(b ?? "", undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

function dateToTimestamp(date: Date | string | null | undefined): number {
	if (!date) return Number.NEGATIVE_INFINITY;

	const timestamp =
		date instanceof Date ? date.getTime() : new Date(date).getTime();
	return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function compareDatesDescending(
	a: Date | string | null | undefined,
	b: Date | string | null | undefined,
): number {
	return dateToTimestamp(b) - dateToTimestamp(a);
}

export function sortRecordsForDisplay(
	records: Iterable<RecordWithSelector>,
): RecordWithSelector[] {
	return Array.from(records).sort((a, b) => {
		const domainOrder = compareText(
			a.domainSelectorPair?.domain,
			b.domainSelectorPair?.domain,
		);
		if (domainOrder) return domainOrder;

		const selectorOrder = compareText(
			a.domainSelectorPair?.selector,
			b.domainSelectorPair?.selector,
		);
		if (selectorOrder) return selectorOrder;

		const lastSeenOrder = compareDatesDescending(a.lastSeenAt, b.lastSeenAt);
		if (lastSeenOrder) return lastSeenOrder;

		const firstSeenOrder = compareDatesDescending(a.firstSeenAt, b.firstSeenAt);
		if (firstSeenOrder) return firstSeenOrder;

		return a.id - b.id;
	});
}
