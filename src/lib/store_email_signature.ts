import { processHeader } from "dkim";
import { prisma } from '@/lib/db';
import { verifyDKIMSignature } from "@zk-email/helpers/dist/dkim";
import crypto from 'crypto';

function hexdigest(data: string, hashfn: string) {
	if (hashfn === 'sha256') {
		return crypto.createHash('sha256').update(data).digest('hex');
	}
	if (hashfn === 'sha512') {
		return crypto.createHash('sha512').update(data).digest('hex');
	}
	throw new Error(`unsupported hashfn=${hashfn}`);
}

function generateHashFromHeaders(signedHeaders: string, headerStrings: string[], headerCanonicalizationAlgorithm: string) {
	const signedHeadersArray = signedHeaders.split(':');
	const signedData = processHeader(headerStrings, signedHeadersArray, headerCanonicalizationAlgorithm);
	const headerHash = hexdigest(signedData, 'sha256');
	return headerHash;
}

export async function storeEmailSignature(
  tags: Record<string, string>,
  headerStrings: string[],
  email: string,
  domain: string,
  selector: string,
  timestamp: Date | null
) {
  const signingAlgorithm = tags.a?.toLowerCase() || "rsa-sha256";
  if (signingAlgorithm !== "rsa-sha256") {
    console.log(`warning: unsupported signing algorithm: ${signingAlgorithm}`);
    return;
  }

	const signedHeaders = tags.h;
	if (!signedHeaders) {
		console.log(`warning: required h= tag missing, skipping`);
		return;
	}

	let dkimSignature = tags.b;
	if (!dkimSignature) {
		console.log('missing b= tag', tags);
		return;
	}

	// Normalize base64 encoding
	dkimSignature = Buffer.from(dkimSignature, 'base64').toString('base64');

	// c is optional, where the default is "simple/simple"
	const headerCanonicalizationAlgorithm = tags.c ? tags.c.split('/')[0] : 'simple';

	try {
		// Verify DKIM signature using zk-email helpers
		const verificationResult = await verifyDKIMSignature(email, "", true, false, true);
	} catch (error) {
		console.error('Error verifying DKIM signature:', error);
	}
	// Generate header hash using our existing function
	const headerHash = generateHashFromHeaders(signedHeaders, headerStrings, headerCanonicalizationAlgorithm);
	
	const hashAndSignatureExists = await prisma.emailSignature.findFirst({ 
		where: { headerHash, dkimSignature } 
	});
	
	if (hashAndSignatureExists) {
		console.log(`skipping existing email signature, domain=${domain} selector=${selector}, timestamp=${timestamp}`);
		return;
	}

	console.log(`storing email dkim signature, domain=${domain} selector=${selector}, timestamp=${timestamp}`);
	await prisma.emailSignature.create({
		data: {
			domain, 
			selector, 
			headerHash, 
			dkimSignature, 
			timestamp, 
			signingAlgorithm,
			canonInfo: '@zk-email/helpers@6.3.3'
		}
	});
}
