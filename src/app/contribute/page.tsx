"use client";

import { InlineCode } from "@/components/InlineCode";
import { cardStyle } from "@/components/styles";
import { signIn } from "next-auth/react";
import React from "react";

export default function Page() {
	return (
		<div>
			<h1>Contribute</h1>
			<p>
				This page lets you contribute to the <a href="https://archive.prove.email/">DKIM Archive</a> site, part of the <a href="https://prove.email">Proof of Email</a> project.
			</p>
			<p>
				You can contribute to the project by uploading domains and selectors from your own Gmail account or from a TSV file.
				The data will be used to build the archive of current and historical DKIM records.
			</p>

			<h2>Ways to contribute to the archive:</h2>

			<h3>Upload from Gmail</h3>
			<p>To upload directly from your Gmail account, visit the <strong><a onClick={() => signIn("google")}>Upload from Gmail</a></strong> page.</p>
			<p>
				When you sign in with your Gmail account and press Start, the site will
				extract the <InlineCode>DKIM-Signature</InlineCode> field from each email message in your Gmail account.
				A signature can look something like this:
			</p>
			<div style={cardStyle}>
				<code style={{ wordBreak: 'break-all' }}>
					DKIM-Signature: v=1; a=rsa-sha256; d=example.net; s=brisbane;
					c=relaxed/simple; q=dns/txt; i=foo@eng.example.net;
					t=1117574938; x=1118006938; l=200;
					h=from:to:subject:date:keywords:keywords;
					z=From:foo@eng.example.net|To:joe@example.com|
					Subject:demo=20run|Date:July=205,=202005=203:44:08=20PM=20-0700;
					bh=MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=;
					b=dzdVyOfAKCdLXdJOc9G2q8LoXSlEniSbav+yuU4zGeeruD00lszZ
					VoG4ZHRNiYzR
				</code>
			</div>
			<p>
				In the example above, the domain is <InlineCode>example.net</InlineCode> and the selector is <InlineCode>brisbane</InlineCode>.
				These are the values that will be extracted and uploaded to the archive.
			</p>

			<h3>Upload from TSV file</h3>
			<p>
				To upload from a file created from an exported archive from any email provider (including Gmail),
				visit the <strong><a href="upload_tsv">Upload from TSV file</a></strong> page.
			</p>
			<p>When you upload from a TSV file, the domain and selector pairs are taken directly from the file and uploaded to the archive.</p>


			<h3>Use the API</h3>
			<p>
				You can contribute to the archive by using the API.
				You find the API specification and can try out the endpoints in the <strong><a href="api-explorer">API Explorer</a></strong>.
			</p>

			<h2>Privacy and security</h2>
			<p>Read the <a href="privacy-policy">Privacy policy</a></p>

			<h3>Disclosure regarding Limited Use:</h3>
			<p>
				DKIM Archive's use and transfer of information received from Google APIs to any other app will adhere to{' '}
				<a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank">
					Google API Services User Data Policy
				</a>
				, including the Limited Use requirements.
			</p>
		</div >
	)
}
