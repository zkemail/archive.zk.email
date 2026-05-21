"use client";

import {
	findKeysPaginated,
	findKeysPaginatedModifiedQuery,
} from "@/app/actions";
import Loading from "@/app/loading";
import type { RecordWithSelector } from "@/lib/db";
import { parseDkimTagList } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
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

	useEffect(() => {
		let ignoreResult = false;

		async function loadRecords() {
			setIsLoading(true);
			const { filteredRecords, newFlag } = await fetchDomainResults(
				domainQuery,
				null,
				"normal",
			);

			if (ignoreResult) return;

			const initialState = buildInitialSearchState(filteredRecords, newFlag);

			setFlag(initialState.flag);
			setRecords(initialState.records);
			setCursor(initialState.cursor);
			setIsLoading(false);
		}

		loadRecords();

		return () => {
			ignoreResult = true;
		};
	}, [domainQuery, setIsLoading]);

	const appendRecords = useCallback((filteredRecords: RecordWithSelector[]) => {
		setRecords((currentRecords) => {
			const updatedRecordsMap = new Map(currentRecords);
			for (const record of filteredRecords) {
				if (!updatedRecordsMap.has(record.id)) {
					updatedRecordsMap.set(record.id, record);
				}
			}
			return updatedRecordsMap;
		});
	}, []);

	const loadMore = useCallback(async () => {
		if (flag === "stop" || (!cursor && flag === "normal")) return;

		const { filteredRecords } = await fetchDomainResults(
			domainQuery,
			cursor,
			flag,
		);

		const lastCursor = filteredRecords[filteredRecords.length - 1]?.id;

		if (filteredRecords.length === 0 || lastCursor === cursor) {
			if (flag === "normal") {
				const { filteredRecords: modifiedRecords } = await fetchDomainResults(
					domainQuery,
					null,
					"modified",
				);
				const modifiedCursor = modifiedRecords[modifiedRecords.length - 1]?.id;

				if (modifiedRecords.length === 0) {
					setCursor(null);
					setFlag("stop");
					return;
				}

				appendRecords(modifiedRecords);
				setCursor(modifiedCursor ?? null);
				setFlag("modified");
				return;
			}

			setCursor(null);
			setFlag("stop");
			return;
		}

		appendRecords(filteredRecords);
		setCursor(lastCursor);
	}, [appendRecords, cursor, domainQuery, flag]);

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
