"use client";

import {
	findKeysPaginated,
	findKeysPaginatedModifiedQuery,
} from "@/app/actions";
import Loading from "@/app/loading";
import type { RecordWithSelector } from "@/lib/db";
import { parseDkimTagList } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { DomainSearchResultsDisplay } from "./DomainSearchResultsDisplay";
import { type FlagState, buildInitialSearchState } from "./domainSearchState";

interface DomainSearchResultsProps {
	domainQuery: string | undefined;
	isLoading: boolean;
	setIsLoading: (isLoading: boolean) => void;
}

function dkimValueHasPrivateKey(dkimValue: string): boolean {
	return !!parseDkimTagList(dkimValue).p;
}

async function fetchDomainResults(
	domainQuery: string | undefined,
	cursor: number | null,
	flagState: FlagState,
): Promise<{ filteredRecords: RecordWithSelector[]; newFlag: FlagState }> {
	if (!domainQuery) return { filteredRecords: [], newFlag: "stop" };

	let fetchedRecords: RecordWithSelector[];
	let nextFlag = flagState;

	if (flagState === "normal") {
		fetchedRecords = await findKeysPaginated(domainQuery, cursor);

		if (fetchedRecords.length === 0 && cursor === null) {
			fetchedRecords = await findKeysPaginatedModifiedQuery(
				domainQuery,
				cursor,
			);
			nextFlag = "modified";
		}
	} else {
		fetchedRecords = await findKeysPaginatedModifiedQuery(domainQuery, cursor);
	}

	const filteredRecords = fetchedRecords.filter((record) =>
		dkimValueHasPrivateKey(record.value),
	);

	return { filteredRecords, newFlag: nextFlag };
}

function DomainSearchResults({
	domainQuery,
	isLoading,
	setIsLoading,
}: DomainSearchResultsProps) {
	const [records, setRecords] = useState<Map<number, RecordWithSelector>>(
		new Map(),
	);
	const [cursor, setCursor] = useState<number | null>(null);
	const [flag, setFlag] = useState<FlagState>("normal");
	const previousFlag = useRef(flag);

	const loadRecords = useCallback(
		async (domainQuery: string | undefined) => {
			const { filteredRecords, newFlag } = await fetchDomainResults(
				domainQuery,
				null,
				"normal",
			);
			const initialState = buildInitialSearchState(filteredRecords, newFlag);

			setFlag(initialState.flag);
			setRecords(initialState.records);
			setCursor(initialState.cursor);
			setIsLoading(false);
		},
		[setIsLoading],
	);

	useEffect(() => {
		setIsLoading(true);
		loadRecords(domainQuery);
	}, [domainQuery, loadRecords, setIsLoading]);

	const loadMore = useCallback(async () => {
		if (flag === "stop" || (!cursor && flag === "normal")) return;

		const { filteredRecords } = await fetchDomainResults(
			domainQuery,
			cursor,
			flag,
		);

		const lastCursor = filteredRecords[filteredRecords.length - 1]?.id;

		if (filteredRecords.length === 0 || lastCursor === cursor) {
			// If no new records are found, stop further loading
			setCursor(null);
			setFlag((oldFlag) => (oldFlag === "normal" ? "modified" : "stop"));
			return;
		}

		setRecords((currentRecords) => {
			const updatedRecordsMap = new Map(currentRecords);
			for (const record of filteredRecords) {
				if (!updatedRecordsMap.has(record.id)) {
					updatedRecordsMap.set(record.id, record);
				}
			}
			return updatedRecordsMap;
		});

		setCursor(lastCursor);
	}, [cursor, domainQuery, flag]);

	useEffect(() => {
		if (previousFlag.current === flag) return;

		previousFlag.current = flag;
		loadMore();
	}, [flag, loadMore]);

	return isLoading ? (
		<Loading />
	) : (
		<DomainSearchResultsDisplay
			records={records}
			domainQuery={domainQuery}
			loadMore={loadMore}
			cursor={cursor}
		/>
	);
}

export default DomainSearchResults;
