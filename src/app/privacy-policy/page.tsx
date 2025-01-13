export default function Page() {

	return (
		<div>
			<h1>Privacy Policy</h1>

			<h2>Privacy policy for Proof of Email</h2>
			<p>This privacy policy describes how DKIM Archive, operated by <strong>Proof of Email</strong> (hereinafter referred to as "we", "us", or "our"), accesses, uses, stores and shares your personal information when you use our website located at <a href="https://archive.prove.email">archive.prove.email</a> (the "website").</p>
			<p><strong>Information we access:</strong></p>
			<ul>
				<li><strong>User email address:</strong> When you sign in with your Gmail account to contribute domains and selectors, we use your email address solely for displaying it to you within the platform.</li>
				<li><strong>Email message:</strong> With your consent, we access your email message, specifically the header fields, to extract domains and selectors from the <code>DKIM-Signature</code> header field.</li>
			</ul>
			<p><strong>Information we store:</strong></p>
			<ul>
				<li><strong>Domain and selector from the DKIM-Signature header field:</strong> For each email message in your email account, we store the domain (<code>d=</code>) and the selector part (<code>s=</code>) of the <code>DKIM-Signature</code> field. The data is used to build our archive of DKIM keys.</li>
			</ul>
			<p><strong>Authentication:</strong></p>
			<ul>
				<li>
					For the authentication with Google, OAuth 2.0 is used.
					The OAuth tokens (access and refresh token) are stored in a JSON Web Token in the web browser.
					The server does not store any tokens.
				</li>
			</ul>
			<p><strong>How we use your information:</strong></p>
			<ul>
				<li><strong>Displaying your email address:</strong> We use your email address for displaying it within the platform when you use the "Upload from Gmail" feature.</li>
				<li><strong>Build an archive of DKIM keys:</strong> We use the extracted domains and selectors from your email header fields to build a publicly accessible archive of historical DKIM keys.</li>
				<li><strong>Build an archive of hashed emails and their corresponding DKIM signatures:</strong>We store the hash of the email content and the corresponding DKIM signature in a database.</li>
			</ul>
			<p><strong>Information sharing and disclosure:</strong></p>
			<ul>
				<li>We do not share your personal information with any third parties except as required by law or to protect our rights and interests.</li>
				<li>The archived DKIM keys, containing domains and selectors (but not personal information), are publicly accessible on the website.</li>
				<li>We may share anonymized or aggregated data with third parties for research or analytical purposes.</li>
			</ul>
			<p><strong>Data security:</strong></p>
			<ul>
				<li>We take reasonable steps to protect your personal information from unauthorized access, disclosure, alteration, or destruction. However, no internet transmission is completely secure, and we cannot guarantee the security of your information.</li>
			</ul>
			<p><strong>Your choices:</strong></p>
			<ul>
				<li>You can choose not to contribute domains and selectors by not using the "Upload from Gmail" feature.</li>
				<li>You can revoke your consent for us to access your email message at any time by managing your Gmail app permissions.</li>
				<li>You can request to delete your user account by contacting us.</li>
			</ul>
			<p><strong>Changes to this privacy policy:</strong></p>
			<ul>
				<li>We may update this privacy policy from time to time. We will notify you of any changes by posting the new privacy policy on the website.</li>
			</ul>
		</div >
	)
}
