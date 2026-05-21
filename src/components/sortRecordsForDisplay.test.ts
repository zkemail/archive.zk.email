import type { RecordWithSelector } from "@/lib/db";
import { expect, test } from "vitest";
import { sortRecordsForDisplay } from "./sortRecordsForDisplay";

function record(
	id: number,
	domain: string,
	selector: string,
	firstSeenAt: string,
	lastSeenAt: string | null,
): RecordWithSelector {
	return {
		id,
		firstSeenAt: new Date(firstSeenAt),
		lastSeenAt: lastSeenAt ? new Date(lastSeenAt) : null,
		domainSelectorPair: {
			domain,
			selector,
		},
	} as RecordWithSelector;
}

test("sorts DKIM records deterministically by domain, selector, and newest seen dates", () => {
	const sorted = sortRecordsForDisplay([
		record(4, "sub.example.com", "alpha", "2024-01-01", "2024-01-01"),
		record(2, "example.com", "beta", "2024-01-01", "2024-01-01"),
		record(1, "example.com", "alpha", "2024-01-01", "2024-01-03"),
		record(3, "example.com", "alpha", "2024-01-01", "2024-01-05"),
	]);

	expect(sorted.map((item) => item.id)).toStrictEqual([3, 1, 2, 4]);
});

test("uses first seen and id as stable tie-breakers when last seen is absent", () => {
	const sorted = sortRecordsForDisplay([
		record(3, "example.com", "alpha", "2024-01-01", null),
		record(1, "example.com", "alpha", "2024-01-03", null),
		record(2, "example.com", "alpha", "2024-01-03", null),
	]);

	expect(sorted.map((item) => item.id)).toStrictEqual([1, 2, 3]);
});
