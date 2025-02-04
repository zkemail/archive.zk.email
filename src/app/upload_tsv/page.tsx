"use client";

import { axiosErrorMessage, load_domains_and_selectors_from_tsv } from "@/lib/utils";
import React from "react";
import { LogConsole, LogRecord } from "@/components/LogConsole";
import axios from "axios";
import { useSession } from "next-auth/react";
import { AddDspRequest, AddDspResponse } from "../api/dsp/route";

export default function Page() {

	const { data: session, status, update } = useSession()
	const [log, setLog] = React.useState<LogRecord[]>([]);
	const [selectedFile, setSelectedFile] = React.useState<File | undefined>();
	const [started, setStarted] = React.useState<boolean>(false);
	const [addedPairs, setAddedPairs] = React.useState<number>(0);

	if (status === "loading" && !session) {
		return <p>loading...</p>
	}

	function fileSelectCallback(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		setSelectedFile(file);
	}

	function logmsg(message: string) {
		console.log(message);
		setLog(log => [...log, { message, date: new Date() }]);
	}

	function readFile(file: File) {
		return new Promise((resolve, reject) => {
			var fr = new FileReader();
			fr.onload = () => {
				resolve(fr.result)
			};
			fr.onerror = reject;
			fr.readAsText(file);
		});
	}

	async function uploadFile() {
		if (!selectedFile) {
			throw "no file selected";
		}
		let fileContent = await readFile(selectedFile);
		if (!fileContent || (typeof fileContent !== "string")) {
			throw "error: invalid file content:" + fileContent;
		}

		let domainSelectorPairs = load_domains_and_selectors_from_tsv(fileContent);

		const addDspApiUrl = 'api/dsp';
		logmsg(`starting upload to ${addDspApiUrl}`);
		for (let i = 0; i < domainSelectorPairs.length; i++) {
			let dsp = domainSelectorPairs[i];
			let timestamp = ''
			const selectorParts = dsp.selector?.split(':') || [];
			if (selectorParts.length > 1) {
				timestamp = selectorParts.slice(1).join(':')
			}
			dsp = { domain: dsp.domain, selector: dsp.selector.split(':')[0] };
			logmsg(`uploading (${i + 1}/${domainSelectorPairs.length}) ${JSON.stringify({ ...dsp, timestamp })}`);
			try {
				let response = await axios.post<AddDspResponse>(addDspApiUrl, dsp as AddDspRequest);
				await update();
				console.log('upsert response', response);
				if (response.data.addResult?.added) {
					logmsg(`${JSON.stringify({ ...dsp, timestamp })} was added to the archive`);
					setAddedPairs(addedPairs => addedPairs + 1);
				}
			}
			catch (error: any) {
				console.error(`error calling ${addDspApiUrl}:`, error);
				throw axiosErrorMessage(error);
			}
		}
	}

	async function startUpload() {
		if (!started) {
			setStarted(true);
			try {
				await uploadFile();
				logmsg("upload complete");
			}
			catch (error) {
				logmsg(`upload failed: ${error}`);
			}
			finally {
				setStarted(false);
			}
		}
	}

	const startEnabled = selectedFile && !started;

	return (
		<div>
			<h1>Upload from TSV file</h1>
			<p>
				Here you can contribute to the database by providing a TSV file with domains and selectors.
			</p>
			<p>
				Follow the instructions in this <a href="https://github.com/zkemail/archive.prove.email?tab=readme-ov-file#mailbox_scraper">README</a>{' '}
				to follow the fully private flow, where you only upload domains and selectors extracted from your inbox, and nothing else.
			</p>
			<div>
				<div>Select a file:</div>
				<input type="file" onChange={fileSelectCallback} accept=".tsv,.txt" />
			</div>
			<p>
				<button disabled={!startEnabled} onClick={startUpload}>
					{started ? "Running..." : "Start"}
				</button>
			</p>
			<p>
				Added domain/selector pairs: {addedPairs}
			</p>
			<LogConsole log={log} setLog={setLog} />
		</div >
	)
}
