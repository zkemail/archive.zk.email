"use client";

import { FC, useEffect, useState, ReactNode } from 'react';
import { Timestamp } from './Timestamp';
import { cardStyle } from './styles';

interface CardData {
  id: number;
  x509Certificate: string;
  jwks: string;
  lastUpdated: Date;
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
  data: CardData;
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
        <Timestamp date={new Date(data.lastUpdated)}/> 
    </Row>
  </div>
);

interface JWKArchiveDisplayListProps {}

export const JWKArchiveDisplayList: FC<JWKArchiveDisplayListProps> = () => {
  const [records, setRecords] = useState<CardData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/key/fetchJwkSet');
        const data: CardData[] = await response.json();
        console.log("data = ", data);
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
      {records.map(record => (
        <JWKArchiveDisplay key={record.id} data={record} />
      ))}
    </div>
  );
};
