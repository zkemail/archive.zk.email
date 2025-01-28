import { DkimRecord, DomainSelectorPair } from "@prisma/client";
import { getCanonicalRecordString } from "./utils";
import { WitnessClient } from "@witnessco/client";
import { prisma, recordToString } from "./db";

interface BackoffOptions {
  initialDelay: number;
  maxDelay: number;
  maxRetries: number;
  backoffFactor: number;
}

const defaultOpts: BackoffOptions = {
  initialDelay: 1000,
  maxDelay: 30000,
  maxRetries: 5,
  backoffFactor: 2,
};

export async function generateWitness(
  dsp: DomainSelectorPair,
  dkimRecord: DkimRecord
) {
  let canonicalRecordString = getCanonicalRecordString(dsp, dkimRecord.value);
  const witness = new WitnessClient(process.env.WITNESS_API_KEY);
  const leafHash = witness.hash(canonicalRecordString);
  let timestamp;
  let attempts = 0;
  let currentDelay = defaultOpts.initialDelay;
  while (attempts < defaultOpts.maxRetries) {
    try {
      attempts++;
      timestamp = await witness.postLeafAndGetTimestamp(leafHash);
      break;
    } catch (error: any) {
      console.error(
        `Attempt witness.postLeafAndGetTimestamp failed for ${recordToString(
          dkimRecord
        )}, leafHash ${leafHash}: ${error}`
      );
      if (attempts === defaultOpts.maxRetries) {
        console.error(
          `Maximum retries reached.Witness.postLeafAndGetTimestamp failed for ${recordToString(
            dkimRecord
          )}, leafHash ${leafHash}: ${error}`
        );
        return;
      }
      currentDelay = Math.min(
        currentDelay * defaultOpts.backoffFactor,
        defaultOpts.maxDelay
      );
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
    }
  }
  console.log(`leaf ${leafHash} was timestamped at ${timestamp}`);
  const proof = await witness.getProofForLeafHash(leafHash);
  const verified = await witness.verifyProofChain(proof);
  if (!verified) {
    console.error("proof chain verification failed");
    return;
  }
  console.log(
    `proof chain verified, setting provenanceVerified for ${recordToString(
      dkimRecord
    )}`
  );
  await prisma.dkimRecord.update({
    where: {
      id: dkimRecord.id,
    },
    data: {
      provenanceVerified: true,
    },
  });
}
