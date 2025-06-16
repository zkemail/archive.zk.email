// app/api/callback/route.ts (or pages/api/callback.ts for Pages Router)
import forge from 'node-forge';
import chalk from "chalk";
import { fetchDkimDnsRecord } from '@/lib/utils_server';
import { prisma } from '@/lib/db';

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

      // const records = await fetchDkimDnsRecord(metadata.domain, metadata.selector);
      const publicKeyDer = forge.asn1.toDer(forge.pki.publicKeyToAsn1(publicKeyRaw)).getBytes();
      const publicKey = forge.util.encode64(publicKeyDer);

      console.log(`${chalk.blue('🔹 Selector :')}  ${chalk.yellow(metadata.selector)}`);
      console.log(`${chalk.blue('🔹 Domain   :')}  ${chalk.yellow(metadata.domain)}`);
      console.log(`${chalk.blue('🔹 Exponent :')}  ${chalk.yellow('65537')}`);
      console.log(`${chalk.blue('🔹 Public Key:')} ${chalk.green(publicKey)}`);

      await storeCalculationResult({
        taskId,
        result,
        status: 'completed',
        completedAt: new Date(),
        metadata,
        publicKey
      });

    } else {
      console.error(`Task ${taskId} failed:`, error);

      // Store the error in your database
      await storeCalculationResult({
        taskId,
        error,
        status: 'failed',
        completedAt: new Date(),
        metadata
      });

      // TODO: You might want to trigger retry logic or notifications here
    }

    // Always return 200 to acknowledge receipt
    return Response.json({
      message: 'Callback processed successfully',
      taskId
    });

  } catch (error) {
    console.error('Error processing callback:', error);

    // Return 500 so the Cloud Function can retry if needed
    return Response.json(
      { error: 'Failed to process callback' },
      { status: 500 }
    );
  }
}

// Add this function to route.ts
async function storeCalculationResult(data: {
  taskId: string;
  result?: string;
  error?: string;
  status: 'completed' | 'failed';
  completedAt: Date;
  metadata?: any;
  publicKey?: any
}) {
  if (data.status === 'failed' || !data.result) {
    console.log(chalk.red(`Failed to store calculation result for task ${data.taskId}: ${data.error}`));
    return;
  }

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
        sourceIdentifier: 'Reverse engineered',
        lastRecordUpdate: data.completedAt
      },
      update: {
        lastRecordUpdate: data.completedAt
      }
    });


    const dkimRecord = await prisma.dkimRecord.create({
      data: {
        domainSelectorPairId: domainSelectorPair.id,
        firstSeenAt: data.completedAt,
        lastSeenAt: data.completedAt,
        provenanceVerified: true,
        value: data.publicKey,
        keyType: 'RSA',
        keyData: data.publicKey,
        source: 'Reverse engineered'
      }
    });


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
    console.error(chalk.red('Error storing calculation result:'), error);
    throw error;
  }
}