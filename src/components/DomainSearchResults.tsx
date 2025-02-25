"use client";

import { findKeysPaginated, findKeysPaginatedModifiedQuery } from "@/app/actions";
import Loading from "@/app/loading";
import { RecordWithSelector } from "@/lib/db";
import { parseDkimTagList } from "@/lib/utils";
import { useCallback, useEffect, useState, useRef } from "react";
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
  const [socket, setSocket] = useState<any>(null);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const nextBruteForceIdRef = useRef<number>(0);

  const loadRecords = useCallback(async (domainQuery: string | undefined) => {
    nextBruteForceIdRef.current = 0;
    const { filteredRecords, newFlag } = await fetchDomainResults(domainQuery, null, "normal");
    if (filteredRecords.length === 0 && domainQuery !== undefined) {
      setFlag("stop");
      setIsLoading(false);
      setFetchMessage("Failed to fetch from archive. Brute Forcing the domain against common selectors ...");
      // console.log("Length of filtered records = 0");
      
      const bruteServerUrl = process.env.BRUTE_SELECTOR_SERVER_URL;
      if (bruteServerUrl) {
        const socket = io(bruteServerUrl);
        setSocket(socket);
        socket.on("connect", () => {
          socket.emit("bruteDomain", { domain: domainQuery });
        });

        socket.on("bruteDomainResponse", (data: any) => {
          if (data.value) {
            const uniqueId = nextBruteForceIdRef.current++; 
            const newDomainSelectorPair = {
              id: uniqueId,
              domain: data.domain,
              selector: data.selector,
              lastRecordUpdate: new Date(),
              sourceIdentifier: 'brute-forced',
            };
            
            const newRecord: RecordWithSelector = {
              id: uniqueId,
              domainSelectorPairId: uniqueId,
              value: data.value,
              provenanceVerified: false,
              source: 'brute-forced',
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
              keyData: null,
              keyType: null,
              domainSelectorPair: newDomainSelectorPair,
            };
            
            setRecords((prevRecords) => {
              const updatedRecords = new Map(prevRecords);
              updatedRecords.set(uniqueId, newRecord);
              // console.log(updatedRecords)
              return updatedRecords;
            });
            
            setIsLoading(false);
            setFlag("stop");
            setCursor(uniqueId);
            setFetchMessage(null);
          }
        });

        socket.on("processingComplete", (data) => {
          setCursor(null);
          setFetchMessage(null);
          socket.disconnect();
        });

        socket.on("connect_error", (error: any) => {
          console.error("Socket.IO connection error:", error);
          socket.close();

          fetch(`${bruteServerUrl}/bruteDomain?domain=${domainQuery}`)
            .then((response) => response.json())
            .then((data: RecordWithSelector[]) => {
              
              setRecords((prevRecords) => {
                const newRecordsMap = new Map(prevRecords);
                
                data.forEach((record) => {
                  if (record.value) {
                    const uniqueId = nextBruteForceIdRef.current++;
                    
                    const newDomainSelectorPair = {
                      id: uniqueId,
                      domain: record.domain,
                      selector: record.selector,
                      lastRecordUpdate: new Date(),
                      sourceIdentifier: 'brute-forced',
                    };
                    
                    const newRecord: RecordWithSelector = {
                      id: uniqueId,
                      domainSelectorPairId: uniqueId,
                      value: record.value,
                      provenanceVerified: false,
                      source: 'brute-forced',
                      firstSeenAt: new Date(),
                      lastSeenAt: new Date(),
                      keyData: null,
                      keyType: null,
                      domainSelectorPair: newDomainSelectorPair,
                    };
                    
                    newRecordsMap.set(uniqueId, newRecord);
                  }
                });
                
                return newRecordsMap;
              });
              
              setIsLoading(false);
              setFetchMessage(null);
            })
            .catch((err) => {
              console.error("Fallback GET request failed:", err);
              setFetchMessage("Brute-force attempt failed. No results found.");
            });
        });

        socket.on("disconnect", () => {
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
      setFetchMessage(null);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setRecords(new Map());
    loadRecords(domainQuery);
  }, [domainQuery, loadRecords]);

  useEffect(() => {
    loadMore();
  }, [flag]);

  async function loadMore() {
    if (flag === "stop" || (!cursor && flag === "normal")) return;

    const { filteredRecords } = await fetchDomainResults(domainQuery, cursor, flag);

    const lastCursor = filteredRecords[filteredRecords.length - 1]?.id;

    if (filteredRecords.length === 0 || lastCursor === cursor) {
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

  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  return isLoading ? (
    <Loading />
  ) : (
    <>
      {fetchMessage && <div className="alert alert-warning">{fetchMessage}</div>}
      <DomainSearchResultsDisplay records={records} domainQuery={domainQuery} loadMore={loadMore} cursor={cursor} />
    </>
  );
}

export default DomainSearchResults;