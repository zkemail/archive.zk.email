import type { RecordWithSelector } from '@/lib/db';
import type { FC, ReactNode } from 'react';
import { cardStyle } from './styles';
import { getCanonicalRecordString, dspSourceIdentifierToHumanReadable, keySourceIdentifierToHumanReadable } from '@/lib/utils';
import { WitnessClient } from '@witnessco/client';
import { Timestamp } from './Timestamp';

interface RowProps {
	label: string;
	children: ReactNode;
}

const Row: FC<RowProps> = ({ label: title, children }) => {
	return (
		<div style={{ display: 'flex', flexWrap: 'wrap', paddingBottom: '0.5rem' }}>
			<div style={{ width: '140px' }}>{title}</div>
			<div>{children}</div>
		</div>
	);
};


const witness = new WitnessClient();

interface ProvenanceIconProps {
	canonicalString: string;
}

export const ProvenanceIcon: FC<ProvenanceIconProps> = ({ canonicalString }) => {
	const leafHash = witness.hash(canonicalString);
	const witnessUrl = `https://scan.witness.co/leaf/${leafHash}`;
	return (
		<a href={witnessUrl} target="_blank" rel="noreferrer">
			<img
				src="/icons8-clock-checked-96.png" alt="witness verified icon"
				style={{ width: '1rem' }}
				title='Check provenance with Witness'
			/>
		</a>
	);
};


interface SelectorResultProps {
	record: RecordWithSelector;
}

export const SelectorResult: React.FC<SelectorResultProps> = ({ record }) => {

	return (
		<div style={cardStyle}>
			<Row label='Domain:'>{record.domainSelectorPair.domain}</Row>
			<Row label='Selector:'>{record.domainSelectorPair.selector}</Row>
			<Row label='First seen at:'>
				<Timestamp date={record.firstSeenAt} />&nbsp;
				{record.provenanceVerified && <ProvenanceIcon canonicalString={getCanonicalRecordString(record.domainSelectorPair, record.value)} />}
			</Row>
			{record.lastSeenAt &&
				<Row label='Last seen at:'>
					<Timestamp date={record.lastSeenAt} />
				</Row>
			}
			<Row label='Value:'>
				<pre style={{
					overflowWrap: 'break-word',
					whiteSpace: 'pre-wrap',
					maxWidth: '32rem',
					margin: '0',
					wordBreak: 'break-all',
				}}>
					{record.value}
				</pre>
			</Row>
			{
				record.domainSelectorPair.sourceIdentifier && record.domainSelectorPair.sourceIdentifier !== 'unknown' &&
				<Row label='Selector origin:'>
					{dspSourceIdentifierToHumanReadable(record.domainSelectorPair.sourceIdentifier)}
				</Row>
			}
			{record.source && <Row label='Key origin:'>{keySourceIdentifierToHumanReadable(record.source)}</Row>}
		</div>
	);
};
