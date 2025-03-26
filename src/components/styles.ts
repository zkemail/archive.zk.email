import type { CSSProperties } from "react";

export const actionButtonStyle: CSSProperties = {
	font: 'inherit',
	border: 'none',
	color: 'white',
	backgroundColor: '#0284c7',
	paddingLeft: '0.75rem',
	paddingRight: '0.75rem',
	borderRadius: '0.375rem',
	height: '2.25rem',
	cursor: 'pointer',
};

export const searchInputBoxStyle: CSSProperties = {
	font: 'inherit',
	borderWidth: '1px',
	borderColor: '#9ca3af',
	paddingLeft: '0.75rem',
	paddingRight: '0.75rem',
	height: '2.25rem',
	margin: '0.5rem',
	borderRadius: '0.375rem',
	borderStyle: 'solid',
	boxSizing: 'border-box',
};

export const cardStyle: CSSProperties = {
	filter: 'drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06))',
	borderRadius: '0.75rem',
	borderWidth: '1px',
	borderColor: '#e5e7eb',
	backgroundColor: 'white',
	padding: '1rem',
	marginTop: '1rem',
	borderStyle: 'solid',
};