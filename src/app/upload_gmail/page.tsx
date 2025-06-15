"use client";

import React, { useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react"
import { LogConsole, type LogRecord } from "@/components/LogConsole";
import { axiosErrorMessage, truncate } from "@/lib/utils";
import axios from "axios";
import type { GmailResponse } from "../api/gmail/route";
import { actionButtonStyle } from "@/components/styles";
import googleButtonStyles from "./page.module.css";

export default function Page() {

	const gmailApiUrl = 'api/gmail';

	const { data: session, status, update } = useSession()
	const [log, setLog] = React.useState<LogRecord[]>([]);
	const [uploadedPairs, setUploadedPairs] = React.useState<Set<string>>(new Set());
	const [addedPairs, setAddedPairs] = React.useState<number>(0);
	const [nextPageToken, setNextPageToken] = React.useState<string>('');
	const [gmailQuery, setGmailQuery] = React.useState<string>('');
	const [processedMessages, setProcessedMessages] = React.useState<number>(0);
	const [totalMessages, setTotalMessages] = React.useState<number | null>(null);
	const [startDate, setStartDate] = React.useState<string>('');
	const [endDate, setEndDate] = React.useState<string>('');
	const [domain, setDomain] = React.useState<string>('');

	type ProgressState = 'Not started' | 'Running...' | 'Paused' | 'Interrupted' | 'Completed';
	const [progressState, setProgressState] = React.useState<ProgressState>('Not started');

	const domainInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (progressState === 'Paused') {
			logmsg(progressState);
		}
		if (progressState === 'Running...') {
			uploadFromGmail(gmailQuery);
		}
	}, [nextPageToken]);

	if (status === "loading" && !session) {
		return <p>loading...</p>
	}

	function NotSignedIn(): React.ReactNode {
		return <div>
			<h3>Sign in to continue</h3>
			<p>
				To use this feature, you need to sign in with your Google account.
				When you click the "Sign in" button, you will be redirected to Google's sign-in flow.
			</p>
			<p>
				Note: Until Google has verified the app, you will see a warning that the app is not verified.
				You can still proceed by clicking "Advanced" and then "Go to DKIM Lookup (unsafe)".
			</p>
			<p>
				The email access tokens are only stored on the user's browser. The server does not store any tokens.
				For more information, see the <a href="/privacy-policy">privacy policy</a>.
			</p>
			<button onClick={() => signIn("google")} className={googleButtonStyles.googleSignInButton}>
        <svg className={googleButtonStyles.googleIcon} viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
          <path fill="none" d="M1 1h22v22H1z" />
        </svg>
        Sign in with Google
      </button>
		</div>
	}


	function InsufficientPermissions(): React.ReactNode {
		return <div>
			<h3>
				Insufficient permissions
			</h3>
			<p>
				To use this feature, you need to grant permission for the site to access email message.
				To do this, <b><a href="#" onClick={() => signOut()}>sign out</a></b> and sign in again,
				and during the sign-in process, give permission to access email message:
			</p>
			<p>
				<img src="/grant_metadata_scope.png" alt="instruction to grant scope" />
			</p>
		</div>
	}

	// check (status !== "unauthenticated" && session) instead of (status === "authenticated")
	// because status can be "loading" even when the user is signed in, causing a flickery behavior
	// as a side effect of the workaround with "await update();"
	const signedIn = (status !== "unauthenticated") && session;

	function ProgressArea(): React.ReactNode {
		if (!signedIn) {
			return <NotSignedIn />
		}

		if (session.has_gmail_scope === false) {
			return <InsufficientPermissions />
		}

		const showStartButton = progressState === 'Not started';
		const showResumeButton = progressState === 'Paused' || progressState === 'Interrupted';
		const showPauseButton = progressState === 'Running...';
		const showProgress = progressState !== 'Not started';

		return <>
			<div style={{ fontWeight: 500 }}>
				Progress: {progressState}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column' }}>
				<div style={{ fontStyle: 'italic', color: '#555' }}>The following fields are optional:</div>
				<label>
					Start Date:
					<input
						type="date"
						value={startDate}
						onChange={(e) => setStartDate(e.target.value)}
						placeholder="Start Date"
						style={{ marginLeft: '0.5rem' }}
					/>
				</label>
				<label>
					End Date:
					<input
						type="date"
						value={endDate}
						onChange={(e) => setEndDate(e.target.value)}
						placeholder="End Date"
						style={{ marginLeft: '0.5rem' }}
					/>
				</label>
				<label>
					Domain:
					<input
						type="text"
						ref={domainInputRef}
						defaultValue={domain}
						onBlur={handleDomainChange}
						placeholder="Domain"
						style={{ marginLeft: '0.5rem' }}
					/>
				</label>
			</div>
			<div>
				{showStartButton && <button style={actionButtonStyle} onClick={() => {
					constructGmailQuery(startDate, endDate, domain);
					
				}}>Start</button>}
				{showResumeButton && <button style={actionButtonStyle} onClick={() => {
					uploadFromGmail(gmailQuery);
				}}>Resume</button>}
				{showPauseButton && <button style={actionButtonStyle} onClick={() => {
					logmsg('pausing upload...');
					setProgressState('Paused');
				}}>Pause</button>}
			</div>
			{showProgress && <>
				<div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
					<div>
						Processed email messages: {processedMessages} {totalMessages ? `of ${totalMessages}` : ''}
					</div>
					<div>
						Uploaded domain/selector pairs: {uploadedPairs.size}
					</div>
					<div>
						Added domain/selector pairs: {addedPairs}
					</div>
				</div>
				<LogConsole log={log} setLog={setLog} />
			</>}
		</>
	}


	function logmsg(message: string) {
		console.log(message);
		setLog(log => [...log, { message, date: new Date() }]);
	}

	function formatDateForGmailQuery(dateString: string): string | null {
		if (!dateString) return null;
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return null; // Invalid date
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}/${month}/${day}`;
	}

	function constructGmailQuery(startDate?: string, endDate?: string, domain?: string) {
		// TODO: compare the dates and show toaster to the user if it enters invalid date
		const startDateGmail = formatDateForGmailQuery(startDate || '');
		const endDateGmail = formatDateForGmailQuery(endDate || '');
		console.log('constructGmailQuery', startDateGmail, endDateGmail, domain);
		const queryParts: string[] = [];
	
		
		if (startDate) {
			queryParts.push(`after:${startDateGmail}`);
		}
		
		if (endDate) {
			queryParts.push(`before:${endDateGmail}`);
		}
		
		if (domain) {
			queryParts.push(`from:${domain}`);
		}
		setGmailQuery(queryParts.join(" "));
		uploadFromGmail(queryParts.join(" "));
	}

	async function uploadFromGmail(currentGmailQuery: string) {
		setProgressState('Running...');
		try {
			logmsg(`fetching page ${nextPageToken}`);
			const params: any = { pageToken: nextPageToken, timeout: 20000, gmailQuery: currentGmailQuery };

			const response = await axios.get<GmailResponse>(gmailApiUrl, { params });
			
			await update();
			if (response.data.messagesTotal) {
				setTotalMessages(response.data.messagesTotal);
			}
			for (const addDspResult of response.data.addDspResults) {
				const pair = addDspResult.domainSelectorPair;
				const pairString = JSON.stringify(pair);
				const timestamp = addDspResult.mailTimestamp;
				if (!uploadedPairs.has(pairString)) {
					logmsg('new pair found: ' + JSON.stringify({ ...pair, timestamp }));
					if (addDspResult.addResult.added) {
						logmsg(`${pairString} was added to the archive`);
						setAddedPairs(addedPairs => addedPairs + 1);
					}
					uploadedPairs.add(pairString);
				}
				setUploadedPairs(uploadedPairs => new Set(uploadedPairs).add(pairString));
			}
			if (response.data.nextPageToken) {
				setNextPageToken(response.data.nextPageToken);
				setProcessedMessages(processedMessages => processedMessages + response.data.messagesProcessed);
			}
			else {
				setProgressState('Completed');
				setNextPageToken('');
				logmsg('upload complete');
			}
		}
		catch (error: any) {
			const message = axiosErrorMessage(error);
			console.log(message);
			logmsg(`error: ${truncate(message, 150)}`);
			setProgressState('Interrupted');
		}
	}

	function handleDomainChange() {
		if (domainInputRef.current) {
			setDomain(domainInputRef.current.value);
		}
	}

	return (
		<div>
			<h1>Upload from Gmail</h1>

			{signedIn && <div>
				{session.user?.email && <div>Signed in as {session?.user?.email}</div>}
				<button onClick={() => signOut()}>Sign out</button>
			</div>}
			<p>
				On this page, you can contribute to the project by uploading domains and selectors from your Gmail account.
			</p>
			<div>
				<p>
					Domains and selectors will be extracted from the DKIM-Signature header field in each email message in your Gmail account.
				</p>
				<ProgressArea />
			</div >
		</div >
	)
}
