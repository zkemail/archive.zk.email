import { processHeader } from "dkim";
import { prisma } from '@/lib/db';
import { verifyDKIMSignature } from "@zk-email/helpers/dist/dkim";
import { mimeWordsDecode } from 'emailjs-mime-codec';

async function hexdigest(data: string, hashfn: string) {
	const crypto = require('crypto');
	if (hashfn === 'sha256') {
		return crypto.createHash('sha256').update(data).digest('hex');
	}
	if (hashfn === 'sha512') {
		return crypto.createHash('sha512').update(data).digest('hex');
	}
	throw new Error(`unsupported hashfn=${hashfn}`);
}

async function generateHashFromHeaders(signedHeaders: string, headerStrings: string[], headerCanonicalizationAlgorithm: string) {
	let signedHeadersArray = signedHeaders.split(':');
	let signedData = processHeader(headerStrings, signedHeadersArray, headerCanonicalizationAlgorithm);
	console.log(`signedHeaderData=${signedData}`);
	let headerHash = await hexdigest(signedData, 'sha256');
	return headerHash;
}

function isMIMEEncoded(str: string): boolean {
	return /=\?[^?]+\?[QBqb]\?[^?]*\?=/.test(str);
}

function normalizeHeader(header: string): string {
	const [name, ...parts] = header.split(':');
	const value = parts.join(':').trim();
	
	// Only decode if it's MIME encoded
	if (isMIMEEncoded(value)) {
		try {
			return `${name}: ${mimeWordsDecode(value)}`;
		} catch (e) {
			console.warn('Failed to decode MIME header:', e);
			return header; // Return original if decode fails
		}
	}
	return header; // Return as-is if not MIME encoded
}

export async function storeEmailSignature(tags: Record<string, string>, headerStrings: string[], domain: string, selector: string, timestamp: Date | null) {
	let signingAlgorithm = tags.a?.toLowerCase() || 'rsa-sha256';
	if (signingAlgorithm !== 'rsa-sha256') {
		console.log(`warning: unsupported signing algorithm: ${signingAlgorithm}`);
		return;
	}

	let signedHeaders = tags.h;
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
	let headerCanonicalizationAlgorithm = tags.c ? tags.c.split('/')[0] : 'simple';

	// Normalize headers while preserving non-MIME ones
	const normalizedHeaders = headerStrings.map(normalizeHeader);

	try {
		// Verify DKIM signature using zk-email helpers
		const fullHeader = normalizedHeaders.join('\r\n');
		console.log(`fullHeader=${fullHeader}`);
		
		// Generate header hash using our existing function
		let headerHash = await generateHashFromHeaders(signedHeaders, normalizedHeaders, headerCanonicalizationAlgorithm);
		
		// Check if RSA passes now, if it does then don't commit the signature to the DB
		// TODO: not implemented

		let hashAndSignatureExists = await prisma.emailSignature.findFirst({ 
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
	} catch (error) {
		console.error('Error verifying DKIM signature:', error);
		return;
	}
}
