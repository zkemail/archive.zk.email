export default function Page() {

	return (
		<div>
			<p className="h1" style={{ marginBottom: 4 }}>Privacy Policy for ZK Email</p>

			<p className="body1">
				Privacy Policy for ZK Email <br />
				Effective Date: 10/4/2024 <br /> <br />
				<br />
				ZK Email ("we," "our," or "us") is committed to safeguarding your privacy and ensuring that your data remains secure and private when using our service. This Privacy Policy explains how we collect, use, and protect your information when you use ZK Email, a privacy-preserving system that allows you to selectively prove the sender, receiver, or contents of emails without exposing sensitive data. Note that this privacy policy is also found on our website at <a href="https://zk.email/privacy-policy">zk.email/privacy-policy</a>.<br />
				<br />
				1. Information We Collect <br />
				ZK Email only processes the specific email data you choose to share for proof generation. This includes: <br />
				<br />
				Email Metadata: Sender, receiver, subject line, and timestamp of the email you are proving. <br />
				Email Content: Only the specific parts of the email you choose to reveal (e.g., Twitter username, mention of a name, etc.). All other parts of the email remain private. <br />
				OAuth Authentication: If integrating with third-party email providers (e.g., Gmail), ZK Email requests read access to your emails and metadata solely to generate proofs. The access scope is strictly limited to what&apos;s needed to perform these functions. <br />
				<br />
				2. How We Use Your Data <br />
				ZK Email uses your data exclusively for proof generation. Here&apos;s how: <br />
				<br />
				Proof Creation: We enable you to prove the contents of an email while concealing the parts you don&apos;t want to disclose. <br />
				Temporary Data Processing: If you choose to generate proofs server-side, raw email data is temporarily stored for the duration of proof generation and deleted immediately afterward. <br />
				Client-Side Privacy: When generating proofs client-side, no email data is stored on our servers. All proof generation happens locally on your device. <br />
				<br />
				3. Data Storage and Retention <br />
				Client-Side Processing: ZK Email does not store any data on our servers during client-side proof generation. All email data remains on your device, ensuring full privacy. <br />
				Server-Side Processing: If server-side proof generation is required, raw email data is temporarily processed and stored until the proof is generated. After the proof is created, the raw data is immediately deleted. The resulting proof may be stored on-chain or off-chain, depending on your requirements. <br />
				Analytics: We use privacy-preserving analytics via tinfoil.sh, an MPC (Multi-Party Computation) based system that performs analytics without storing any individual session data. As a result, ZK Email does not require cookie banners or any invasive tracking. <br />
				<br />
				4. Third-Party Access <br />
				ZK Email does not sell or rent your data under any circumstance. We share your email data with third parties in the following circumstances: <br />
				<br />
				Proof Verification: If the proof needs to be pushed on-chain (e.g., to verify email ownership or content), the disclosed data will be available on the blockchain, where it will remain immutable. <br />
				Service Providers: We may work with trusted partners (e.g., cloud infrastructure providers) to facilitate server-side proof generation. These partners are contractually obligated to comply with our privacy policies. <br />
				<br />
				4.1 DKIM Archive Service <br />
				The DKIM Archive (archive.prove.email) is a specific service within ZK Email that requires additional privacy considerations: <br />
				<br />
				Information Access and Storage: <br />
				- User Email Address: When signing in with Gmail, we only use your email address for display purposes within the platform. <br />
				- Email Headers: With explicit consent, we access email headers to extract DKIM-Signature fields, specifically domains (d=) and selectors (s=). <br />
				- DKIM Keys Archive: We maintain a public archive of historical DKIM keys built from contributed domains and selectors. <br />
				- Email Hashes: We store cryptographic hashes of email content and corresponding DKIM signatures in our database. Note that these do not contain PII and are not linked to users in any way. <br />
				<br />
				Authentication and Security: <br />
				- We use OAuth 2.0 for Google authentication. <br />
				- OAuth tokens are stored only in the browser as JSON Web Tokens. <br />
				- Our servers do not retain authentication tokens. <br />
				<br />
				User Control: <br />
				- The &ldquo;Upload from Gmail&rdquo; feature is optional and requires explicit consent. <br />
				- Users can revoke Gmail access permissions at any time. <br />
				- Account deletion requests can be submitted to our support team. <br />
				<br />
				Public Information: <br />
				- The DKIM key archive, containing domains and selectors, is publicly accessible. <br />
				- No personal information is included in the public archive. <br />
				<br />
				5. Security Measures <br />
				We employ robust security measures to protect your data: <br />
				<br />
				Zero-Knowledge Proofs: Our system uses advanced cryptography to ensure that only the email content you explicitly reveal is exposed. Everything else remains private. <br />
				Encryption: All data transmissions are encrypted, ensuring that any email data being transferred is secured. <br />
				Client-Side Proving: For maximum privacy, ZK Email allows users to generate proofs entirely on their own device, meaning no data is shared with ZK Email servers unless explicitly consented to. <br />
				<br />
				6. Consent and Control <br />
				You have full control over the data ZK Email processes: <br />
				<br />
				OAuth Authorization: If you connect an email provider (e.g., Gmail) to ZK Email, we request explicit permission to access only the emails required to create proofs. <br />
				Proof Generation Consent: You must manually consent to temporary storage of email data if server-side processing is necessary. This is clearly indicated in the user interface (UI). <br />
				Blockchain Consent: If you choose to push proofs on-chain, ZK Email will prompt for your explicit consent before publishing any email-related data on a blockchain. <br />
				<br />
				7. Your Rights <br />
				You have the right to: <br />
				<br />
				Withdraw Access: You can revoke access to your email account at any time through the OAuth settings of your email provider. <br />
				Data Deletion: ZK Email will delete any temporary raw email data once the proof generation process is complete. We store no personal data unless it is explicitly included in a proof you chose to push to the blockchain. <br />
				Transparency: You can request information on any data ZK Email has processed or stored for proof generation. <br />
				<br />
				8. Changes to This Policy <br />
				We may update this Privacy Policy from time to time. When changes are made, we will notify users by posting the revised policy on our website, and changes will take effect immediately. <br />
				<br />
				9. Contact Us <br />
				For any questions or concerns regarding your privacy, feel free to reach out to us at: <br />
				<br />
				Email: admin@prove.email <br />
				Company: Ivy Research, LLC <br />
				<br />
				This Privacy Policy is designed to comply with privacy standards, including Google&apos;s OAuth requirements, ensuring that ZK Email accesses only the necessary data for its privacy-preserving features without retaining or exposing sensitive information.
				<br />
			</p>
		</div>
	)
}
