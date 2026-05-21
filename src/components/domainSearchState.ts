import type { RecordWithSelector } from "../lib/db";

export type FlagState = "normal" | "modified" | "stop";

interface InitialSearchState {
	records: Map<number, RecordWithSelector>;
	cursor: number | null;
	flag: FlagState;
}

export function buildInitialSearchState(
	filteredRecords: RecordWithSelector[],
	newFlag: FlagState,
): InitialSearchState {
	if (filteredRecords.length === 0) {
		return {
			records: new Map(),
			cursor: null,
			flag: "stop",
		};
	}

	const records = new Map<number, RecordWithSelector>();
	for (const record of filteredRecords) {
		records.set(record.id, record);
	}

	return {
		records,
		cursor: filteredRecords[filteredRecords.length - 1]?.id ?? null,
		flag: newFlag,
	};
}
