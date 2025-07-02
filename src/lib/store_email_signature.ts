import { prisma } from '@/lib/db';
import { verifyDKIMSignature } from "@zk-email/helpers/dist/dkim";
import crypto from 'crypto';
import chalk from 'chalk';
import { canonicalizeHeaders, computeCanonicalizedHeaderHash, encodeRsaPkcs1Digest, parseDkimSignature, selectSignedHeadersnew } from "./utils";
import { Prisma } from "@prisma/client";
import { AddResult, pubKeyLength } from "./utils_server";
import { createGcdCalculationTask, GcdCalculationPayload } from "./calculateGcdTask";


export async function processAndStoreEmailSignature(
	headerStrings: string[][],
	dkimSignature: string,
	tags: Record<string, string>,
	timestamp: Date | null,
	email: string,
	addResult: AddResult
) {
	console.time('processAndStoreEmailSignature')
	console.time('verificationResult')
	try {
		// This verificationResult tells us if the DKIM signature has bad signature or not.
		const verificationResult = await verifyDKIMSignature(email, tags.d, true, true, true);
		console.timeEnd('verificationResult')
	} catch (error) {
		console.timeEnd('verificationResult')
		console.log(chalk.redBright('Error verifying DKIM signature:\n Domain: ', tags.d, '\n', error));
		if (
			error instanceof Error &&
			error.message &&
			error.message.includes("bad signature")
		) {
			return { processResultError: "Error verifying DKIM signature due to bad signature" };
		}
	}

	/*
	Basic run down of below Steps :-
	1. we will parse header and Signature values
	2. we will canonicalize the header and signature values
	3. we will find header hash for storage and Possibly GCD calculation
	*/

	// Signature values are parsed for canonicaization
	const dkimSigsArrayParsed = parseDkimSignature(dkimSignature);

	// Header values are parsed for canonicalization
	const signedHeadersraw = tags.h;
	if (!signedHeadersraw) {
		console.log(`warning: required h= tag missing, skipping`);
		return;
	}
	const signedHeadersArray = signedHeadersraw.split(':')
	const signedHeaders = selectSignedHeadersnew(headerStrings, signedHeadersArray);


	// canonicalize header hash
	const headerCanonicalizationAlgorithm = tags.c ? tags.c.split('/')[0] : 'simple';
	const signed_data = canonicalizeHeaders(signedHeaders, headerCanonicalizationAlgorithm);


	// Canoniacalize signature
	const canonicalised_signature = canonicalizeHeaders(dkimSigsArrayParsed, headerCanonicalizationAlgorithm);

	// Calculating the header hash
	const hashingAlgorithm = tags.a;
	const hashInstance = crypto.createHash(hashingAlgorithm.replace('rsa-', ''));
	computeCanonicalizedHeaderHash(hashInstance, signed_data, canonicalised_signature, headerCanonicalizationAlgorithm);
	const headerHash = hashInstance.digest('hex');



	const signingAlgorithm = tags.a?.toLowerCase() || "rsa-sha256";
	if (signingAlgorithm !== "rsa-sha256" && signingAlgorithm !== "rsa-sha1" && signingAlgorithm !== "rsa-sha512") {
		console.log(`warning: unsupported signing algorithm: ${signingAlgorithm}`);
		return;
	}

	const domain = tags.d;
	const selector = tags.s;
	let dkimSignatureRaw = tags.b;
	if (!dkimSignatureRaw) {
		console.log('missing b= tag', tags);
		return;
	}


	/*
	Basic rundown of the steps below:
	1. Check if the hash and signature exist. If they do, we skip the rest of the processing and return early.
	2. If it doesn't exist, we directly store it in the DB.
	3. Check if the public key exists or we got it from DNS.
	4. If not, we query other pairs from database, if we find any we calculate the GCD else we return.
	*/


	console.time("insertOrIgnore");
	try {
		const result = await prisma.$executeRaw`
		INSERT INTO "EmailSignature" (
			domain, selector, "headerHash", "headerHashV2", 
			"dkimSignature", timestamp, "signingAlgorithm", "canonInfo"
		) 
		VALUES (
			${domain}, ${selector}, ${headerHash}, ${headerHash},
			${dkimSignatureRaw}, ${timestamp}, ${signingAlgorithm}, 
			${'@zk-email/helpers@6.3.3'}
		)
		ON CONFLICT ("headerHashV2", "dkimSignature") DO NOTHING
	`;

		console.timeEnd("insertOrIgnore");

		if (result === 0) {
			console.log(chalk.yellow(`headerHash and Signature already exist in DB`));
			return { processResultError: "headerHash and Signature already exist in DB" };
		} else {
			console.log(chalk.green(`New email signature inserted successfully`));
		}
	} catch (error) {
		console.timeEnd("insertOrIgnore");
		throw error;
	}

	// AddResult checks if we got the Public Key via DNS query or it already existed in DB, if not we calculate the GCD
	if (!addResult.added && !addResult.already_in_db) {
		// Fetching future and past Email signature for the given domain and selector
		console.time("Email signatures");
		const [futureEmailSigs, pastEmailSigs] = await Promise.all([
			prisma.emailSignature.findMany({
				where: {
					domain: { equals: domain, mode: Prisma.QueryMode.insensitive },
					selector: { equals: selector, mode: Prisma.QueryMode.insensitive },
					timestamp: { gt: timestamp || undefined },
				},
				take: 2,
				orderBy: { timestamp: 'asc' },
			}),
			prisma.emailSignature.findMany({
				where: {
					domain: { equals: domain, mode: Prisma.QueryMode.insensitive },
					selector: { equals: selector, mode: Prisma.QueryMode.insensitive },
					timestamp: { lt: timestamp || undefined },
				},
				take: 2,
				orderBy: { timestamp: 'desc' },
			}),
		]);
		console.timeEnd("Email signatures");


		// The combined results will have up to 4 records.
		const dsps = [...futureEmailSigs, ...pastEmailSigs];
		console.log(chalk.blue(`Found ${dsps.length} Email signatures for domain: ${domain}, selector: ${selector}`));


		if (dsps.length === 0) {
			console.log(chalk.red(`No existing DSPs found for domain: ${domain}, selector: ${selector}. Can't check for GCD.`));
			return { processResultError: "No existing DSPs found for domain,Can't check for GCD" };
		}

		// Calculating the signature and encoded message digest for the current email.
		const signature1 = BigInt(`0x${Buffer.from(dkimSignatureRaw, 'base64').toString('hex')}`).toString();
		const keySizeBytes = pubKeyLength(dkimSignatureRaw);
		const headerHashBuffer1 = Buffer.from(headerHash, "hex");
		const encodedMessageDigest1 = encodeRsaPkcs1Digest(headerHashBuffer1, signingAlgorithm, keySizeBytes).toString();

		// Loop through each found DSP to create a GCD calculation task against the current email.
		const result = [];
		for (const dsp of dsps) {
			// Ensure the database record has the required fields.
			if (!dsp.dkimSignature || !dsp.headerHashV2) {
				console.log(chalk.yellow(`Skipping DSP id ${dsp.id} due to missing dkimSignature or headerHashV2.`));
				continue;
			}

			// Handle case where the signing algorithms do not match
			if (signingAlgorithm !== (dsp.signingAlgorithm?.toLowerCase() || "rsa-sha256")) {
				console.log(chalk.red(`Signing algorithm mismatch for DSP id ${dsp.id}: Current(${signingAlgorithm}) vs DSP(${dsp.signingAlgorithm})`));
				continue;
			}

			// Calculating the signature and encoded message digest for the DSP.
			const signature2 = BigInt(`0x${Buffer.from(dsp.dkimSignature, 'base64').toString('hex')}`).toString();
			const headerHashBuffer2 = Buffer.from(dsp.headerHashV2, "hex");
			const encodedMessageDigest2 = encodeRsaPkcs1Digest(headerHashBuffer2, signingAlgorithm, keySizeBytes).toString();
			const taskId = crypto.randomBytes(16).toString('hex').toString();

			const timestamp1 = (!dsp.timestamp || (timestamp && timestamp < dsp.timestamp)) ? timestamp : dsp.timestamp;
			const timestamp2 = (!dsp.timestamp || (timestamp && timestamp < dsp.timestamp)) ? dsp.timestamp : timestamp;
			const metadata = {
				domain,
				selector,
				headerHash1: headerHash,
				dkimSignature1: dkimSignatureRaw,
				headerHash2: dsp.headerHashV2,
				dkimSignature2: dsp.dkimSignature,
				timestamp1,
				timestamp2,
				signingAlgorithm
			};

			const payload: GcdCalculationPayload = { s1: signature1, s2: signature2, em1: encodedMessageDigest1, em2: encodedMessageDigest2, taskId, metadata };

			let createGCDResult = await createGcdCalculationTask(payload);
			result.push(createGCDResult);
			console.log(chalk.green(`Created GCD calculation task for DSP id ${dsp.id}.`));
		}
		return result;
	}
	console.timeEnd('processAndStoreEmailSignature')
}
