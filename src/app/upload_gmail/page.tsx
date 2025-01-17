"use client";

import React, { useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react"
import type { Session } from "@/app/auth"
import { LogConsole, LogRecord } from "@/components/LogConsole";
import { axiosErrorMessage, truncate } from "@/lib/utils";
import axios from "axios";
import { GmailResponse } from "../api/gmail/route";
import { actionButtonStyle } from "@/components/styles";
import googleButtonStyles from "./page.module.css";

export default function Page() {

	const gmailApiUrl = 'api/gmail';

	const { data: session, status, update } = useSession() as { data: Session | null, status: string, update: () => Promise<Session | null> }
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
	const [needsReadonlyScope, setNeedsReadonlyScope] = React.useState<boolean>(false);

	// Check if we need readonly scope when component mounts or when query params change
	useEffect(() => {
		const requiresReadonly = detectQueryNeedsReadonlyScope(startDate, endDate, domain);
		setNeedsReadonlyScope(requiresReadonly);

		// Check if we need to trigger re-auth when domain is added
		if (domain && session?.has_gmail_metadata && !session?.has_gmail_readonly) {
			console.log('Domain specified with only metadata scope - requires re-authentication');
			// Force sign out to trigger re-auth with readonly scope
			signOut();
		}
	}, [startDate, endDate, domain, session?.has_gmail_metadata, session?.has_gmail_readonly]);

	type ProgressState = 'Not started' | 'Running...' | 'Paused' | 'Interrupted' | 'Completed';
	const [progressState, setProgressState] = React.useState<ProgressState>('Not started');

	function detectQueryNeedsReadonlyScope(startDate?: string, endDate?: string, domain?: string): boolean {
		return !!(startDate || endDate || domain);
	}

	const domainInputRef = useRef<HTMLInputElement>(null);

	function constructGmailQuery(startDate?: string, endDate?: string, domain?: string): string {
		console.log('constructGmailQuery', startDate, endDate, domain);
		let queryParts: string[] = [];
	
		if (startDate) {
			queryParts.push(`after:${startDate}`);
		}
	
		if (endDate) {
			queryParts.push(`before:${endDate}`);
		}
	
		if (domain) {
			queryParts.push(`from:${domain}`);
		}
	
		return queryParts.join(" ");
	}

	useEffect(() => {
		if (progressState === 'Paused') {
			logmsg(progressState);
		}
		if (progressState === 'Running...' && nextPageToken) {
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
			<button
				onClick={() => {
					// Determine required scope based on current query parameters
					const requiresReadonly = detectQueryNeedsReadonlyScope(startDate, endDate, domain);
					signIn("google", {
						scope: requiresReadonly
							? "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.readonly"
							: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.metadata"
					});
				}}
				className={googleButtonStyles.googleSignInButton}
			>
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
				Sign in with Google {needsReadonlyScope ? "(Full Access)" : "(Metadata Only)"}
      </button>
		</div>
	}


	function InsufficientPermissions(): React.ReactNode {
		const requiredScope = needsReadonlyScope ? "full email access" : "email metadata access";
		const scopeReason = needsReadonlyScope 
			? domain 
				? "You need full access because you've specified a domain for searching. This requires accessing email content to search by sender domain."
				: "You need full access because you've specified search criteria (dates). This allows searching email content."
			: "Only metadata access is required when no search criteria are specified. This is more privacy-friendly as it only accesses email headers.";
		
		return <div>
			<h3>
				Insufficient permissions
			</h3>
			<p>
				To use this feature with your current settings, you need to grant permission for {requiredScope}.
				{scopeReason}
			</p>
			<p>
				To update permissions, <b><a href="#" onClick={() => signOut()}>sign out</a></b> and sign in again.
				During the sign-in process, make sure to grant the requested permissions:
			</p>
			<p>
				<img 
					src={needsReadonlyScope ? "/grant_readonly_scope.png" : "/grant_metadata_scope.png"} 
					alt={`instruction to grant ${requiredScope}`} 
				/>
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

		let showStartButton = progressState === 'Not started';
		let showResumeButton = progressState === 'Paused' || progressState === 'Interrupted';
		let showPauseButton = progressState === 'Running...';
		let showProgress = progressState !== 'Not started';

		return <>
			<div style={{ fontWeight: 500 }}>
				Progress: {progressState}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column' }}>
				<div style={{ fontStyle: 'italic', color: '#555' }}>
					The following fields are optional. Note: Using any of these fields requires full Gmail access permissions.
					{needsReadonlyScope && <div style={{ color: '#d32f2f', marginTop: '0.5rem' }}>
						{domain ? 
							"You've specified a domain - you'll need to sign in again to grant full access permissions." :
							"Using search criteria will require full access permissions when you start the upload."}
					</div>}
				</div>
				<label>
					Start Date:
					<input
						type="date"
						value={startDate}
						onChange={(e) => setStartDate(formatDate(e.target.value) ?? '')}
						placeholder="Start Date"
						style={{ marginLeft: '0.5rem' }}
					/>
				</label>
				<label>
					End Date:
					<input
						type="date"
						value={endDate}
						onChange={(e) => setEndDate(formatDate(e.target.value) ?? '')}
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
					const requiresReadonly = detectQueryNeedsReadonlyScope(startDate, endDate, domain);
					setNeedsReadonlyScope(requiresReadonly);
					const query = constructGmailQuery(startDate, endDate, domain);
					setGmailQuery(query);
					uploadFromGmail(query);
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

	function formatDate(dateString: string): string | null {
		if (!dateString) return null;
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return null; // Invalid date
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}/${month}/${day}`;
	}

	async function uploadFromGmail(currentGmailQuery: string) {
		setProgressState('Running...');
		try {
			logmsg(`fetching page ${nextPageToken}`);
			let params: any = { pageToken: nextPageToken, timeout: 20000, gmailQuery: currentGmailQuery };

			let response = await axios.get<GmailResponse>(gmailApiUrl, { params });
			
			await update();
			if (response.data.messagesTotal) {
				setTotalMessages(response.data.messagesTotal);
			}
			for (const addDspResult of response.data.addDspResults) {
				const pair = addDspResult.domainSelectorPair;
				const pairString = JSON.stringify(pair);
				if (!uploadedPairs.has(pairString)) {
					logmsg('new pair found: ' + JSON.stringify(pair));
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
			const newDomain = domainInputRef.current.value;
			
			// Detect if we're switching from no domain to having a domain
			const isAddingDomain = !domain && newDomain;
			
			// Check if we need to trigger re-auth (metadata only -> domain added)
			const needsReauth = isAddingDomain && session?.has_gmail_metadata && !session?.has_gmail_readonly;
			
			// Update domain state
			setDomain(newDomain);
			
			// Store that we need re-auth if adding domain with only metadata scope
			if (needsReauth) {
				console.log('Domain added while having only metadata scope - will need re-authentication');
				setNeedsReadonlyScope(true);
				alert("You've specified a domain, which requires full Gmail access permissions. You will need to sign in again to grant these permissions.");
			}
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
