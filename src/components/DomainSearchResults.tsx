"use client";

import { findKeysPaginated, findKeysPaginatedModifiedQuery } from "@/app/actions";
import Loading from "@/app/loading";
import { RecordWithSelector } from "@/lib/db";
import { parseDkimTagList } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { DomainSearchResultsDisplay } from "./DomainSearchResultsDisplay";
import { io } from "socket.io-client";

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
  const [socket, setSocket] = useState<any>(null); // Use `any` for Socket.IO client
  const [socketMessages, setSocketMessages] = useState<string[]>([]);

  const loadRecords = useCallback(async (domainQuery: string | undefined) => {
    const { filteredRecords, newFlag } = await fetchDomainResults(domainQuery, null, "normal");

    if (filteredRecords.length === 0 && domainQuery !== undefined) {
      setFlag("stop");
      setIsLoading(true);
      console.log("Length of filtered records = 0");

      const bruteServerUrl = process.env.BRUTE_SELECTOR_SERVER_URL
      if (bruteServerUrl) {
        const socket = io(bruteServerUrl);
        setSocket(socket);

        socket.on("connect", () => {
          console.log("Socket.IO connected");
          socket.emit("bruteDomain", { domain: domainQuery });
        });

        socket.on("bruteDomainResponse", (data: any) => {
          console.log("Socket.IO message received:", data);
          setSocketMessages((prev) => [...prev, data]);

          if (data.value) {
            const newDomainSelectorPair = {
              id: 0,
              domain: data.domain,
              selector: data.selector,
              lastRecordUpdate: null,
              sourceIdentifier: "brute-forced",
            };
            const newRecord: RecordWithSelector = {
              id: records.size,
              domainSelectorPairId: 0,
              value: data.value,
              provenanceVerified: false,
              source: "brute-forced",
              firstSeenAt: new Date(),
              lastSeenAt: null,
              keyData: null,
              keyType: null,
              domainSelectorPair: newDomainSelectorPair,
            };
            setRecords((prevRecords) => new Map(prevRecords.set(newRecord.id, newRecord)));
            setIsLoading(false);
            setFlag("stop");
          }
        });

        socket.on("connect_error", (error: any) => {
          console.error("Socket.IO connection error:", error);
          socket.close();

          // Fallback to GET request if Socket.IO fails
          fetch(`${bruteServerUrl}/bruteDomain?domain=${domainQuery}`)
            .then((response) => response.json())
            .then((data: RecordWithSelector[]) => {
              console.log("Fallback data:", data);
              const newRecordsMap = new Map(records);

              data.forEach((record) => {
                if (record.value) {
                  const newDomainSelectorPair = {
                    id: 0,
                    domain: record.domain,
                    selector: record.selector,
                    lastRecordUpdate: null,
                    sourceIdentifier: "brute-forced",
                  };
                  const newRecord: RecordWithSelector = {
                    id: records.size,
                    domainSelectorPairId: 0,
                    value: record.value,
                    provenanceVerified: false,
                    source: "brute-forced",
                    firstSeenAt: new Date(),
                    lastSeenAt: null,
                    keyData: null,
                    keyType: null,
                    domainSelectorPair: newDomainSelectorPair,
                  };
                  newRecordsMap.set(newRecord.id, newRecord);
                }
              });

              setRecords(newRecordsMap);
              setIsLoading(false);
            })
            .catch((err) => console.error("Fallback GET request failed:", err));
        });

        socket.on("disconnect", () => {
          console.log("Socket.IO disconnected");
          const newRecordsMap = new Map(records);
          setRecords(newRecordsMap);
          setIsLoading(false);
          setSocket(null);
        });
      }
    } else {
      const newRecordsMap = new Map(records);
      filteredRecords.forEach((record) => newRecordsMap.set(record.id, record));

      setFlag(newFlag);
      setRecords(newRecordsMap);
      setCursor(filteredRecords[filteredRecords.length - 1]?.id);
      setIsLoading(false);
    }
  }, [records, setIsLoading, setFlag, setSocket, setSocketMessages, setRecords, setCursor]);

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

  // Cleanup Socket.IO on component unmount
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect(); // Disconnect Socket.IO
      }
    };
  }, [socket]);

  return isLoading ? (
    <Loading />
  ) : (
    <DomainSearchResultsDisplay records={records} domainQuery={domainQuery} loadMore={loadMore} cursor={cursor} />
  );
}

export default DomainSearchResults;