"use client";

import { findKeysPaginated, findKeysPaginatedModifiedQuery } from "@/app/actions";
import Loading from "@/app/loading";
import { RecordWithSelector } from "@/lib/db";
import { parseDkimTagList } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { DomainSearchResultsDisplay } from "./DomainSearchResultsDisplay";

interface DomainSearchResultsProps {
  domainQuery: string | undefined;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
}

type flagState = "normal" | "modified" | "stop";

function dkimValueHasPrivateKey(dkimValue: string): boolean {
  return !!parseDkimTagList(dkimValue).p;
}

async function fetchDomainResults(
  domainQuery: string | undefined,
  cursor: number | null,
  flagState: flagState
): Promise<{ filteredRecords: RecordWithSelector[]; newFlag: flagState }> {
  if (!domainQuery) return { filteredRecords: [], newFlag: "stop" };

  let fetchedRecords;

  if (flagState === "normal") {
    fetchedRecords = await findKeysPaginated(domainQuery, cursor);

    if (fetchedRecords.length === 0 && cursor === null) {
      fetchedRecords = await findKeysPaginatedModifiedQuery(domainQuery, cursor);
      flagState = "modified";
    }
  } else {
    fetchedRecords = await findKeysPaginatedModifiedQuery(domainQuery, cursor);
  }

  const filteredRecords = fetchedRecords.filter((record) => dkimValueHasPrivateKey(record.value));

  return { filteredRecords, newFlag: flagState };
}

function DomainSearchResults({ domainQuery, isLoading, setIsLoading }: DomainSearchResultsProps) {
  const [records, setRecords] = useState<Map<number, RecordWithSelector>>(new Map());
  const [cursor, setCursor] = useState<number | null>(null);
  const [flag, setFlag] = useState<flagState>("normal");

  const loadRecords = useCallback(async (domainQuery: string | undefined) => {
    const { filteredRecords, newFlag } = await fetchDomainResults(domainQuery, null, "normal");

    if (filteredRecords.length === 0) {
      setFlag("stop");
      setIsLoading(false);
      return;
    }

    const newRecordsMap = new Map(records);
    filteredRecords.forEach((record) => newRecordsMap.set(record.id, record));

    setFlag(newFlag);
    setRecords(newRecordsMap);
    setCursor(filteredRecords[filteredRecords.length - 1]?.id);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    loadRecords(domainQuery);
  }, [domainQuery]);

  useEffect(() => {
    loadMore();
  }, [flag]);

  async function loadMore() {
    if (flag === "stop" || (!cursor && flag === "normal")) return;

    const { filteredRecords } = await fetchDomainResults(domainQuery, cursor, flag);

    const lastCursor = filteredRecords[filteredRecords.length - 1]?.id;

    if (filteredRecords.length === 0 || lastCursor === cursor) {
      // If no new records are found, stop further loading
      setCursor(null);
      setFlag((oldFlag) => (oldFlag === "normal" ? "modified" : "stop"));
      return;
    }

    const updatedRecordsMap = new Map(records);

    filteredRecords.forEach((record) => {
      if (!updatedRecordsMap.has(record.id)) {
        updatedRecordsMap.set(record.id, record);
      }
    });

    setCursor(lastCursor);
    setRecords(updatedRecordsMap);
  }

  return isLoading ? (
    <Loading />
  ) : (
    <DomainSearchResultsDisplay records={records} domainQuery={domainQuery} loadMore={loadMore} cursor={cursor} />
  );
}

export default DomainSearchResults;
