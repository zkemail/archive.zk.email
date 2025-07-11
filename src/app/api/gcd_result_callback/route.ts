
import forge from 'node-forge';
import chalk from "chalk";
import { pubKeyLength } from '@/lib/utils_server';
import { prisma } from '@/lib/db';
import { encodeRsaPkcs1Digest } from '@/lib/utils';
import { generateWitness } from '@/lib/generateWitness';

function verifyRsaPublicKey(
  publicKeyHex: string,
  signatureBase64: string,
  messageDigestHex: string,
  signingAlgorithm: string,
  exponentStr: string = "65537"
): boolean {
  try {
    const keySizeBytes = pubKeyLength(signatureBase64);

    if (publicKeyHex.length !== keySizeBytes * 2) {
      console.error(`Public key length mismatch: expected ${keySizeBytes} hex characters, got ${publicKeyHex.length}`);
      return false;
    }
    // Encode the message digest as per PKCS#1 for the given algorithm
    const encodedDigest = encodeRsaPkcs1Digest(
      Buffer.from(messageDigestHex, "hex"),
      signingAlgorithm,
      keySizeBytes
    ).toString();

    // Convert signature from base64 to BigInt string
    const signatureBigIntStr = BigInt(`0x${Buffer.from(signatureBase64, 'base64').toString('hex')}`).toString();

    // Convert all values to forge.jsbn.BigInteger
    const modulus = new forge.jsbn.BigInteger(publicKeyHex, 16);
    const signature = new forge.jsbn.BigInteger(signatureBigIntStr, 10);
    const encodedDigestBigInt = new forge.jsbn.BigInteger(encodedDigest, 10);
    const exponent = new forge.jsbn.BigInteger(exponentStr, 10);

    // RSA verification: signature^exponent mod modulus
    const verified = signature.modPow(exponent, modulus);

    // Compare the result with the encoded digest
    return verified.compareTo(encodedDigestBigInt) === 0;

  } catch (error) {
    console.error('Error during RSA verification:', error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { success, result, error, taskId, metadata } = body;

    if (!taskId) {
      console.error('Missing taskId in callback');
      return Response.json(
        { error: 'Missing taskId' },
        { status: 400 }
      );
    }

    if (success) {
      console.log(chalk.magenta(`Task ${taskId} completed successfully.`));

      let publicKeyBigInt = BigInt(result);
      const publicKeyHex = publicKeyBigInt.toString(16);
      const publicKeyBigIntjsbn = new forge.jsbn.BigInteger(publicKeyHex, 16);
      const e = new forge.jsbn.BigInteger('010001', 16);
      const publicKeyRaw = forge.pki.setRsaPublicKey(publicKeyBigIntjsbn, e);

      const publicKeyDer = forge.asn1.toDer(forge.pki.publicKeyToAsn1(publicKeyRaw)).getBytes();
      const publicKey = forge.util.encode64(publicKeyDer);

      console.log(`${chalk.blue('🔹 Selector :')}  ${chalk.yellow(metadata.selector)}`);
      console.log(`${chalk.blue('🔹 Domain   :')}  ${chalk.yellow(metadata.domain)}`);
      console.log(`${chalk.blue('🔹 Public Key:')} ${chalk.green(publicKey)}`);

      const isHeaderHash1SignatureValid = verifyRsaPublicKey(publicKeyHex, metadata.dkimSignature1, metadata.headerHash1, metadata.signingAlgorithm);
      const isHeaderHash2SignatureValid = verifyRsaPublicKey(publicKeyHex, metadata.dkimSignature2, metadata.headerHash2, metadata.signingAlgorithm);

      if (!isHeaderHash1SignatureValid || !isHeaderHash2SignatureValid) {
        return Response.json(
          {
            error: 'Public Key is Not valid'
          }, {
          status: 400
        })
      }

      await storeCalculationResult({
        taskId,
        result,
        completedAt: new Date(),
        metadata,
        publicKey
      });

    } else {
      console.log(chalk.red(`Task ${taskId} failed: ${error} Failed to store calculation result for task`));
    }

    return Response.json({
      message: 'Callback processed successfully',
      taskId
    }, { status: 200 });

  } catch (error) {
    console.error('Error processing callback:', error);

    // Return 500 so the Cloud Function can retry if needed
    return Response.json(
      { error: 'Failed to process callback' },
      { status: 500 }
    );
  }
}

async function storeCalculationResult(data: {
  taskId: string;
  result?: string;
  error?: string;
  completedAt: Date;
  metadata?: any;
  publicKey?: any
}) {

  try {
    const domainSelectorPair = await prisma.domainSelectorPair.upsert({
      where: {
        id: await prisma.domainSelectorPair.findFirst({
          where: {
            domain: data.metadata.domain,
            selector: data.metadata.selector
          }
        }).then(dsp => dsp?.id ?? -1)
      },
      create: {
        domain: data.metadata.domain,
        selector: data.metadata.selector,
        sourceIdentifier: 'api_auto',
        lastRecordUpdate: data.completedAt
      },
      update: {
        lastRecordUpdate: data.completedAt
      }
    });

    let dkimRecord = await prisma.dkimRecord.findFirst({
      where: {
        domainSelectorPairId: domainSelectorPair.id,
        keyData: data.publicKey
      }
    });

    if (dkimRecord) {
      const newFirstSeenAt = new Date(
        Math.min(new Date(dkimRecord.firstSeenAt!).getTime(), new Date(data.metadata.timestamp1).getTime())
      );
      const newLastSeenAt = new Date(
        Math.max(new Date(dkimRecord.lastSeenAt!).getTime(), new Date(data.metadata.timestamp2).getTime())
      );

      dkimRecord = await prisma.dkimRecord.update({
        where: { id: dkimRecord.id },
        data: {
          firstSeenAt: newFirstSeenAt,
          lastSeenAt: newLastSeenAt
        }
      });
      console.log(chalk.blue(`Updating existing DKIM record for domain: ${data.metadata.domain}, selector: ${data.metadata.selector}`));
    } else {
      dkimRecord = await prisma.dkimRecord.create({
        data: {
          domainSelectorPairId: domainSelectorPair.id,
          firstSeenAt: data.metadata.timestamp1,
          lastSeenAt: data.metadata.timestamp2,
          provenanceVerified: false,
          value: `p=${data.publicKey}`,
          keyType: 'RSA',
          keyData: data.publicKey,
          source: 'public_key_gcd_cloud_function'
        }
      });
      console.log(chalk.blue(`Creating new DKIM record for domain: ${data.metadata.domain}, selector: ${data.metadata.selector}`));
    }

    generateWitness(domainSelectorPair, dkimRecord);

    // Find the email signature entries 
    const emailSignatureA = await prisma.emailSignature.findFirst({
      where: {
        domain: data.metadata.domain,
        selector: data.metadata.selector,
        headerHash: data.metadata.headerHash1,
        dkimSignature: data.metadata.dkimSignature1
      }
    });

    const emailSignatureB = await prisma.emailSignature.findFirst({
      where: {
        domain: data.metadata.domain,
        selector: data.metadata.selector,
        headerHash: data.metadata.headerHash2,
        dkimSignature: data.metadata.dkimSignature2
      }
    });

    if (!emailSignatureA || !emailSignatureB) {
      throw new Error('Could not find email signatures');
    }

    // Create the GCD result entry linking the signatures
    await prisma.emailPairGcdResult.create({
      data: {
        emailSignatureA_id: emailSignatureA.id,
        emailSignatureB_id: emailSignatureB.id,
        foundGcd: true,
        dkimRecordId: dkimRecord.id,
        timestamp: data.completedAt
      }
    });

    console.log(chalk.green(`Successfully stored GCD calculation result for task ${data.taskId}`));

  } catch (error) {
    console.error(chalk.red('Error storing calculation result:', error));
  }
}