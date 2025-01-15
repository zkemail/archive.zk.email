"use client";

import { FC, useEffect, useState, ReactNode } from 'react';
import { Timestamp } from './Timestamp';
import { cardStyle } from './styles';
import { ProvenanceIcon } from './SelectorResult';
import { getCanonicalJWKRecordString } from '@/lib/utils';

interface JWKData {
  id: number;
  x509Certificate: string;
  jwks: string;
  lastUpdated: Date;
  provenanceVerified: boolean;
}

interface RowProps {
  label: string;
  children: ReactNode;
}

const Row: FC<RowProps> = ({ label: title, children }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', paddingBottom: '0.5rem' }}>
    <div style={{ width: '140px', fontWeight: 'bold' }}>{title}</div>
    <div>{children}</div>
  </div>
);

interface CardProps {
  data: JWKData;
}

export const JWKArchiveDisplay: FC<CardProps> = ({ data }) => (
<div style={cardStyle}>
    <Row label="ID:">{data.id}</Row>
    <Row label="X509 Certificate:">
      <pre style={{ overflowWrap: 'break-word', whiteSpace: 'pre-wrap', maxWidth: '32rem', margin: '0', wordBreak: 'break-all' }}>
        {data.x509Certificate}
      </pre>
    </Row>
    <Row label="JWKS:">
      <pre style={{ overflowWrap: 'break-word', whiteSpace: 'pre-wrap', maxWidth: '32rem', margin: '0', wordBreak: 'break-all' }}>
        {data.jwks}
      </pre>
    </Row>
    <Row label="Last Updated:">
        <Timestamp date={new Date(data.lastUpdated)}/>&nbsp;
				{data.provenanceVerified && <ProvenanceIcon canonicalString={getCanonicalJWKRecordString(data)} />} 
    </Row>
  </div>
);

interface JWKArchiveDisplayListProps {}

export const JWKArchiveDisplayList: FC<JWKArchiveDisplayListProps> = () => {
  const [records, setRecords] = useState<JWKData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/key/fetchJwkSet');
        const data: JWKData[] = await response.json();
        setRecords(data);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {records.length === 0 ? (
        <p>No records available.</p>
      ) : (
        records.map(record => (
          <JWKArchiveDisplay key={record.id} data={record} />
        ))
      )}
    </div>
  );

};
