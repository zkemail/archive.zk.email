import { DkimRecord, DomainSelectorPair } from "@prisma/client";
import { getCanonicalJWKRecordString, getCanonicalRecordString, jwkSet } from "./utils";
import { WitnessClient } from "@witnessco/client";
import { prisma, recordToString } from "./db";

export async function generateWitness(dsp: DomainSelectorPair, dkimRecord: DkimRecord) {
	let canonicalRecordString = getCanonicalRecordString(dsp, dkimRecord.value);
	const witness = new WitnessClient(process.env.WITNESS_API_KEY);
	const leafHash = witness.hash(canonicalRecordString);
	let timestamp;
	try {
		timestamp = await witness.postLeafAndGetTimestamp(leafHash);
	}
	catch (error: any) {
		console.error(`witness.postLeafAndGetTimestamp failed for ${recordToString(dkimRecord)}, leafHash ${leafHash}: ${error}`);
		return;
	}
	console.log(`leaf ${leafHash} was timestamped at ${timestamp}`);
	const proof = await witness.getProofForLeafHash(leafHash);
	const verified = await witness.verifyProofChain(proof);
	if (!verified) {
		console.error('proof chain verification failed');
		return;
	}
	console.log(`proof chain verified, setting provenanceVerified for ${recordToString(dkimRecord)}`);
	await prisma.dkimRecord.update({
		where: {
			id: dkimRecord.id
		},
		data: {
			provenanceVerified: true
		}
	});
}

export async function generateJWKWitness(
	JwkSet: jwkSet
) {
  let canonicalRecordString = getCanonicalJWKRecordString(JwkSet);
  const witness = new WitnessClient(process.env.WITNESS_API_KEY);
  const leafHash = witness.hash(canonicalRecordString);
  let timestamp;
  try {
    timestamp = await witness.postLeafAndGetTimestamp(leafHash);
  } catch (error: any) {
    console.error(
      `witness.postLeafAndGetTimestamp failed for ${JwkSet}, leafHash ${leafHash}: ${error}`
    );
    return;
  }
  console.log(`leaf ${leafHash} was timestamped at ${timestamp}`);
  const proof = await witness.getProofForLeafHash(leafHash);
  const verified = await witness.verifyProofChain(proof);
  if (!verified) {
    console.error("proof chain verification failed");
    return;
  }
  console.log(
    `proof chain verified, setting provenanceVerified for ${JwkSet}`
  );
  await prisma.jsonWebKeySets.update({
    where: {
      id: JwkSet.id,
    },
    data: {
      provenanceVerified: true,
    },
  });
}
