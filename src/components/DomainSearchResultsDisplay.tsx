"use client";
import type { RecordWithSelector } from "@/lib/db";
import type React from "react";
import { useEffect, useMemo } from "react";
import { useInView } from "react-intersection-observer";
import { SelectorResult } from "./SelectorResult";
import { sortRecordsForDisplay } from "./sortRecordsForDisplay";

interface DomainSearchResultProps {
	domainQuery: string | undefined;
	records: Map<number, RecordWithSelector>;
	loadMore: () => void;
	cursor: number | null;
}

export const DomainSearchResultsDisplay: React.FC<DomainSearchResultProps> = ({
	domainQuery,
	records,
	loadMore,
	cursor,
}) => {
	const { ref: inViewElement, inView } = useInView();
	const sortedRecords = useMemo(
		() => sortRecordsForDisplay(records.values()),
		[records],
	);

	// loadMore is intentionally omitted so the sentinel does not refetch on every parent render.
	// biome-ignore lint/correctness/useExhaustiveDependencies: loadMore is intentionally render-unstable.
	useEffect(() => {
		if (inView) {
			loadMore();
		}
	}, [inView]);

	if (!domainQuery) {
		return <div>Enter a search term</div>;
	}
	if (!sortedRecords.length) {
		return <div>No records found for "{domainQuery}"</div>;
	}
	return (
		<div>
			<p>
				Search results for <b>{domainQuery}</b>
			</p>
			<div>
				{sortedRecords.map((record) => (
					<SelectorResult key={record.id} record={record} />
				))}
			</div>
			{!cursor && <p>No more records</p>}
			<div ref={inViewElement} />
		</div>
	);
};
