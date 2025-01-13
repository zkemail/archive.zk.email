"use client";
import { RecordWithSelector } from "@/lib/db";
import React, { useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { SelectorResult } from "./SelectorResult";

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
  const mergedRecords = mergeRecordsByValue(Array.from(records.values()));
  const { ref: inViewElement, inView } = useInView();

  useEffect(() => {
    if (inView) {
      loadMore();
    }
  }, [inView]);

  if (!domainQuery) {
    return <div>Enter a search term</div>;
  }
  if (!Array.from(records.values())?.length) {
    return <div>No records found for "{domainQuery}"</div>;
  }
  return (
    <div>
      <p>
        Search results for <b>{domainQuery}</b>
      </p>
      <div>
        {mergedRecords.map((record) => (
          <SelectorResult key={record.id} record={record} />
        ))}
      </div>
      {!cursor && <p>No more records</p>}
      <div ref={inViewElement} />
    </div>
  );
};

function mergeRecordsByValue(records: RecordWithSelector[]): RecordWithSelector[] {
  const valueMap = new Map<string, RecordWithSelector>();

  records.forEach((record) => {
    if (valueMap.has(record.value)) {
      const existing = valueMap.get(record.value)!;

      existing.firstSeenAt = new Date(Math.min(existing.firstSeenAt.getTime(), record.firstSeenAt.getTime()));

      if (existing.lastSeenAt && record.lastSeenAt) {
        existing.lastSeenAt = new Date(Math.max(existing.lastSeenAt.getTime(), record.lastSeenAt.getTime()));
      } else {
        existing.lastSeenAt = existing.lastSeenAt || record.lastSeenAt;
      }

      valueMap.set(record.value, existing);
    } else {
      valueMap.set(record.value, record);
    }
  });

  return Array.from(valueMap.values());
}
