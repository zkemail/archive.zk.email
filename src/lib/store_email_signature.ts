import { processHeader, verifySignature } from "dkim";
import { prisma } from "@/lib/db";
// import { verifyDKIMSignatureDirect } from '@/lib/utils';
import { 
  verifyDKIMSignature,
  DKIMVerificationResult,
} from "@zk-email/helpers/dist/dkim";
import fs from "fs";
// import {DKIMVerifier} from "mailauth";

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

function cleanDKIMSignature(header: string): string {
  return header
    .split("\n")
    .map((line) => {
      return line.toLowerCase().startsWith("dkim-signature:")
        ? line.replace(/b=[^;]*(;|$)/gi, "b=;")
        : line;
    })
    .join("\n");
}

async function generateHashFromHeaders(signedHeaders: string, headerStrings: string[], headerCanonicalizationAlgorithm: string) {
	const signedHeadersArray = signedHeaders.split(':').map(header => header.trim());
	let signedData = processHeader(headerStrings, signedHeadersArray, headerCanonicalizationAlgorithm);
	signedData = cleanDKIMSignature(signedData);
  let headerHash = await hexdigest(signedData, 'sha256');
  console.log("===========================================")
  console.log("Signed Data  === ", signedData);
  console.log("HeaderHash == ", headerHash);
  console.log("Sigenr header == ", signedHeaders);
  console.log("===========================================");
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
  let headerHash;
  try {
    // Verify DKIM signature using zk-email helpers
    const verificationResult = await verifyDKIMSignature(email);
    const str = verificationResult.headers.toString("utf8");
    const strArray = str.split("\r\n");
    headerHash = await generateHashFromHeaders(signedHeaders, strArray, headerCanonicalizationAlgorithm);
    console.log(headerHash);
    fs.writeFileSync(`${domain}_verifier.txt`, email + "\n\n\n\n" + headerHash);
    console.log(strArray);
    
  } catch (error) {
    console.error('Error verifying DKIM signature: ', error);
    // console.log("#######################################");
    // headerHash = await generateHashFromHeaders(
    //   signedHeaders,
    //   headerStrings,
    //   headerCanonicalizationAlgorithm
    // );
    // console.log(headerHash);
    // fs.writeFileSync(
    //   `${domain}_headers.txt`,
    //   headerStrings.join("\r\n") + "\n\n\n\n" + headerHash
    // );
    // console.log("#######################################");
  }

    console.log("#######################################");
    headerHash = await generateHashFromHeaders(
      signedHeaders,
      headerStrings,
      headerCanonicalizationAlgorithm
    );
    console.log(headerHash);
    fs.writeFileSync(
      `${domain}_headers.txt`,
      headerStrings.join("\r\n") + "\n\n\n\n" + headerHash
    );
    console.log("#######################################");

    let hashAndSignatureExists = await prisma.emailSignature.findFirst({ 
      where: { headerHash, dkimSignature }, 
    });

    if (hashAndSignatureExists) {
      console.log(
        `skipping existing email signature, domain=${domain} selector=${selector}, timestamp=${timestamp}`
      );
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
