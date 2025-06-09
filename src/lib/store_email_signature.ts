import { processHeader } from "dkim";
import { prisma } from '@/lib/db';
import { verifyDKIMSignature } from "@zk-email/helpers/dist/dkim";
import crypto from 'crypto';
import { canonicalizeHeaders, computeCanonicalizedHeaderHash, parseDkimSignature, selectSignedHeadersnew } from "./utils";

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


export async function calculateGCDandStoreEmailSignature(
  headerStrings: string[][],
  dkimSignature: string,
  tags: Record<string, string>,
  timestamp: Date | null,
) {
  /***
   * Step 1: check if the domain selector pair exist in emailSignature table
   * If exist, check if the one or mulitple exist, if mulitple take one, if the status is "processing" then skip
   * Step 2: set the status to "processing"
   * Step 3: calcuate the GCD of the email signature
   * Step 4: store the GCD in emailSignature table
   * Step 5: set the status to "completed"
   * Step 6: return the GCD
  */

       // Signature values are parsed for canonicaization
      const dkimSigsArrayParsed = parseDkimSignature(dkimSignature); 


	  // Header values are parsed for canonicalization
      const signedHeadersraw = tags.h;
      const signedHeadersArray = signedHeadersraw.split(':')
      const signedHeaders = selectSignedHeadersnew(headerStrings, signedHeadersArray);
      console.log("\n\nsigned Headers new\n",signedHeaders);

	  // canonicalize header hash
      const headerCanonicalizationAlgorithm = tags.c ? tags.c.split('/')[0] : 'simple';
      const signed_data = canonicalizeHeaders(signedHeaders,  headerCanonicalizationAlgorithm);
  

      // Canoniacalize signature
      const canonicalised_signature = canonicalizeHeaders(dkimSigsArrayParsed,  headerCanonicalizationAlgorithm);

	  // Calculatingthe header hash
      const hashingAlgorithm = tags.a;
      const hashInstance = crypto.createHash(hashingAlgorithm.replace('rsa-', ''));
 
      computeCanonicalizedHeaderHash( hashInstance, signed_data ,canonicalised_signature, headerCanonicalizationAlgorithm);
      const finalHash = hashInstance.digest('hex');
      console.log("finalHash",finalHash);
   
   // Removed the constraints of sha256, we can now support sha-1, sha512 as well 
   const signingAlgorithm = tags.a?.toLowerCase() || "rsa-sha256";
	if (signingAlgorithm !== "rsa-sha256" && signingAlgorithm !== "rsa-sha1" && signingAlgorithm !== "rsa-sha512") {
		console.log(`warning: unsupported signing algorithm: ${signingAlgorithm}`);
		return;
	}

	// const signedHeaders = tags.h;
	// if (!signedHeaders) {
	// 	console.log(`warning: required h= tag missing, skipping`);
	// 	return;
	// }

	// let dkimSignature = tags.b;
	// if (!dkimSignature) {
	// 	console.log('missing b= tag', tags);
	// 	return;
	// }

	// Normalize base64 encoding
	// doubtful please recheck this part, it seems like a bug
	console.log('dkimSignature before normalization:', dkimSignature);
	dkimSignature = Buffer.from(dkimSignature, 'base64').toString('base64');
	console.log('dkimSignature after normalization:', dkimSignature);

	// c is optional, where the default is "simple/simple"
	// const headerCanonicalizationAlgorithm = tags.c ? tags.c.split('/')[0] : 'simple';

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

export async function storeEmailSignature(
  tags: Record<string, string>,
  headerStrings: string[],
  email: string,
  domain: string,
  selector: string,
  timestamp: Date | null,
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
	console.log('dkimSignature before normalization:', dkimSignature);
	dkimSignature = Buffer.from(dkimSignature, 'base64').toString('base64');
	console.log('dkimSignature after normalization:', dkimSignature);

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
