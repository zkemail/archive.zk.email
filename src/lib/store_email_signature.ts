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
	try {
		// This verificationResult tells weather we can bad signature or not,
		const verificationResult = await verifyDKIMSignature(email, tags.d, true, true, true);
	} catch (error) {
		console.log(chalk.redBright('Error verifying DKIM signature:\n Domain: ', tags.d, '\n', error));
		if (error && typeof error === "string" && (error as any).includes("Reason: bad signature")) {
			return;
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
	Basic run down of below Steps :-
	1. Check hash And Signature Exists
	2. Check if dsp exist or not
	3. If it doesn't exist we directly store in DB, since we can't check for GCD with one dsp value
	4. We check if public Key already existed in DB or got via DNS query, if not we calculate the GCD
	*/

	// check if Doamin-selector pair is already present in EmailSignature table
	const dsp = await prisma.emailSignature.findFirst({
		where: {
			domain: {
				equals: domain,
				mode: Prisma.QueryMode.insensitive,
			},
			selector: {
				equals: selector,
				mode: Prisma.QueryMode.insensitive
			}
		}
	});

	// Check hash And Signature Exists
	const hashAndSignatureExists = await prisma.emailSignature.findFirst({
		where: { headerHashV2: headerHash, dkimSignature: dkimSignatureRaw }
	});

	if (hashAndSignatureExists) {
		console.log(chalk.yellow(`headerHash and Signature already exist in DB`));
		return;
	} else {
		await prisma.emailSignature.create({
			data: {
				domain,
				selector,
				headerHash,
				headerHashV2: headerHash,
				dkimSignature: dkimSignatureRaw,
				timestamp,
				signingAlgorithm,
				canonInfo: '@zk-email/helpers@6.3.3'
			}
		});
	}


	// AddResult checks if we got the Public Key via DNS query or it already existed in DB, if not we calculate the GCD
	if (!addResult.added && !addResult.already_in_db) {
		if (!dsp) { console.log(chalk.red(`No DSP exist: Domain: ${domain}, Selector: ${selector}, Can't check GCD`)); return; }
		else {
			// Converting the signature into big int for gcd calculation
			const signature1 = BigInt(`0x${Buffer.from(dkimSignatureRaw, 'base64').toString('hex')}`).toString();
			const signature2 = BigInt(`0x${Buffer.from(dsp.dkimSignature, 'base64').toString('hex')}`).toString();

			const keySizeBytes = pubKeyLength(dkimSignatureRaw);

			// Converting header hashes into buffer and then into bigint for calculation
			const headerHashBuffer1 = Buffer.from(headerHash, "hex");
			const headerHashBuffer2 = Buffer.from(dsp.headerHashV2 || '', "hex");

			// TODO: handle case what if the signing algo doesn't match
			const encodedMessageDigest1 = encodeRsaPkcs1Digest(headerHashBuffer1, signingAlgorithm, keySizeBytes).toString();
			const encodedMessageDigest2 = encodeRsaPkcs1Digest(headerHashBuffer2, signingAlgorithm, keySizeBytes).toString();
			const taskId = crypto.randomBytes(16).toString('hex').toString();
			const metadata = {
				domain,
				selector,
				headerHash1: headerHash,
				dkimSignature1: dkimSignatureRaw,
				headerHash2: dsp.headerHashV2,
				dkimSignature2: dsp.dkimSignature,
				timestamp,
				signingAlgorithm
			};

			const payload: GcdCalculationPayload = { s1: signature1, s2: signature2, em1: encodedMessageDigest1, em2: encodedMessageDigest2, taskId, metadata };

			await createGcdCalculationTask(payload)
		}

	}
}
