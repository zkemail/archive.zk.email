import { expect, test } from "vitest";
import type { RecordWithSelector } from "../lib/db";
import { buildInitialSearchState } from "./domainSearchState";

function record(id: number): RecordWithSelector {
	return { id } as RecordWithSelector;
}

test("clears stale records when a fresh search returns no results", () => {
	const previousRecords = new Map([[1, record(1)]]);

	const state = buildInitialSearchState([], "normal");

	expect(state.records).not.toBe(previousRecords);
	expect(state.records.size).toBe(0);
	expect(state.cursor).toBeNull();
	expect(state.flag).toBe("stop");
});

test("replaces stale records with the fresh search results", () => {
	const previousRecords = new Map([[1, record(1)]]);

	const state = buildInitialSearchState([record(2), record(3)], "modified");

	expect(state.records).not.toBe(previousRecords);
	expect(Array.from(state.records.keys())).toStrictEqual([2, 3]);
	expect(state.cursor).toBe(3);
	expect(state.flag).toBe("modified");
});
