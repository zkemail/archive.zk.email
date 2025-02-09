import { processHeader } from "dkim";
import { prisma } from '@/lib/db';


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
import { DkimVerifier } from 'dkimpy';

async function generateHashFromHeaders2(signedHeaders: string, headerStrings: string[], headerCanonicalizationAlgorithm: string) {
    // Convert headers to the format dkimpy expects
    const headers = headerStrings.map(h => {
        const [name, ...rest] = h.split(':');
        return [name, rest.join(':').trim()];
    });

    // Create verifier with same settings as signing
    const d = new DkimVerifier(headers);
    
    // Use dkimpy's internal hash_headers function which handles:
    // - Proper header canonicalization
    // - Correct header ordering
    // - CRLF normalization
    // - Whitespace handling
    return d.hash_headers(signedHeaders, headerCanonicalizationAlgorithm);
}

async function generateHashFromHeaders(signedHeaders: string, headerStrings: string[], headerCanonicalizationAlgorithm: string) {
	let signedHeadersArray = signedHeaders.split(':');
	let signedData = processHeader(headerStrings, signedHeadersArray, headerCanonicalizationAlgorithm);
	let headerHash = await hexdigest(signedData, 'sha256');
	return headerHash;
}

export async function storeEmailSignature(tags: Record<string, string>, headerStrings: string[], domain: string, selector: string, timestamp: Date | null) {
	let signingAlgorithm = tags.a.toLowerCase();
	if (signingAlgorithm) {
		if (signingAlgorithm !== 'rsa-sha256') {
			console.log(`warning: unsupported signing algorithm: ${signingAlgorithm}`);
			return;
		}
	}
	else {
		console.log('warning: required a= tag missing, using rsa-sha256');
		signingAlgorithm = 'rsa-sha256';
	}

	let signedHeaders = tags.h
	if (!signedHeaders) {
		console.log(`warning: required h= tag missing, skipping`);
		return;
	}

	let dkimSignature = tags.b
	if (!dkimSignature) {
		console.log('missing b= tag', tags);
		return;
	}

	dkimSignature = Buffer.from(dkimSignature, 'base64').toString('base64'); // normalize base64 encoding

	// c is optional, where the default is "simple/simple"
	let headerCanonicalizationAlgorithm = tags.c ? tags.c.split('/')[0] : 'simple';


	let headerHash = await generateHashFromHeaders(signedHeaders, headerStrings, headerCanonicalizationAlgorithm);
	let headerHash2 = await generateHashFromHeaders2(signedHeaders, headerStrings, headerCanonicalizationAlgorithm);
	if (headerHash !== headerHash2) {
		console.log(`headerHash mismatch: ${headerHash} !== ${headerHash2}`);
	}
	let hashAndSignatureExists = await prisma.emailSignature.findFirst({ where: { headerHash, dkimSignature } });
	if (hashAndSignatureExists) {
		console.log(`skipping existing email signature, domain=${domain} selector=${selector}, timestamp=${timestamp}`);
		return;
	}
	console.log(`storing email dkim signature, domain=${domain} selector=${selector}, timestamp=${timestamp}`);
	await prisma.emailSignature.create({
		data: {
			domain, selector, headerHash, dkimSignature, timestamp, signingAlgorithm,
			canonInfo: 'dkim@0.8.0'
		}
	});
}
