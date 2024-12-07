import asyncio
import binascii
import json
import logging
import os
import subprocess
from datetime import datetime
from prisma import Prisma
from prisma.models import EmailSignature
from prisma.enums import KeyType
from Cryptodome.PublicKey import RSA
from Cryptodome.Signature import PKCS1_v1_5 
from Cryptodome.Hash import SHA256
from gcd_solver import pkcs1_padding, message_sig_pair
from common import Dsp, get_date_interval
import sys
import httpx
from tqdm import tqdm
from typing import Any
import gmpy2  # type: ignore

gmpy2_mpz: Any = gmpy2.mpz  # type: ignore
gmpy2_gcd: Any = gmpy2.gcd  # type: ignore

DspToSigs = dict[Dsp, list[EmailSignature]]


def find_key(dsp: Dsp, sig0: EmailSignature, sig1: EmailSignature, loglevel: int) -> str | None:
	assert sys.executable.endswith('python3.10'), f"Expected python3.10, but got {sys.executable}"
	cmd = [sys.executable, "src/util/pubkey_finder/gcd_solver.py", "--loglevel", str(loglevel)]
	hashfn = 'sha256'
	data_parameters = [sig0.headerHash, sig0.dkimSignature, sig1.headerHash, sig1.dkimSignature, hashfn]
	logging.debug(" ".join(cmd) + ' [... data parameters ...]')

	output = subprocess.check_output(cmd + data_parameters)
	data = json.loads(output)
	n = int(data['n_hex'], 16)
	e = int(data['e_hex'], 16)
	if (n < 2):
		return None
	rsa_key = RSA.construct((n, e))
	keyDER = rsa_key.exportKey(format='DER')
	keyDER_base64 = binascii.b2a_base64(keyDER, newline=False).decode('utf-8')
	return keyDER_base64


async def has_known_keys(prisma: Prisma, dsp: Dsp, dspsWithKnownKeys: set[Dsp]) -> bool:
	if dsp in dspsWithKnownKeys:
		return True
	dnsRecord = await prisma.domainselectorpair.find_first(where={'domain': dsp.domain, 'selector': dsp.selector})
	if dnsRecord:
		dspsWithKnownKeys.add(dsp)
		return True
	return False

async def validate_signature(keyData: str, sig: EmailSignature) -> bool:
    try:
        # Try a few different approaches to verify the signature
        rsa_key = RSA.import_key(binascii.a2b_base64(keyData))
        verifier = PKCS1_v1_5.new(rsa_key)
        sig_bytes = binascii.a2b_base64(sig.dkimSignature)
        logging.info(f'validating signature {sig.id} with message {sig.headerHash} and signature {sig.dkimSignature} with sig bytes {sig_bytes} with key {keyData}')
        logging.info(f'Signature bytes length: {len(sig_bytes)}')
 
        # Approach 1: Using raw hash bytes
        h = SHA256.new()
        h.digest = lambda: bytes.fromhex(sig.headerHash)
        if verifier.verify(h, sig_bytes):
            logging.info(f'signature {sig.id} validated with raw hash bytes')
            return True
            
        # Approach 2: Using pkcs1 padding like in gcd_solver
        size_bytes = len(sig_bytes)
        message, signature = message_sig_pair(size_bytes, sig.headerHash, sig_bytes, 'sha256')

        decrypted = pow(signature, rsa_key.e, rsa_key.n)
        logging.info(f'Approach 2 comparison:')
        logging.info(f'Expected: {hex(message)}')
        logging.info(f'Got:      {hex(decrypted)}')
        
        if pow(signature, rsa_key.e, rsa_key.n) == message:
            logging.info(f'signature {sig.id} validated with pkcs1 padding')
            return True
        
        return False
    except:
        return False


# Check if the signature can be validated by either of the key records in the database, either the one before or the one after, and check if that key validates the signature, and if so then update the either starting or ending date in the database
# Returns true if the signature was validated by either key and false otherwise
async def check_adjacent_sigs(dsp: Dsp, sig: EmailSignature, prisma: Prisma) -> bool:
    # Find the domain/selector pair record
    logging.info(f'checking adjacent sigs for {dsp.domain}:{dsp.selector} at timestamp {sig.timestamp}')
    dsp_record = await prisma.domainselectorpair.find_first(
        where={'domain': dsp.domain, 'selector': dsp.selector}
    )
    if not dsp_record:
        logging.info(f'no domain/selector pair record found for {dsp.domain}:{dsp.selector}')
        return False

    # Get all DKIM records for this domain/selector pair
    dkim_records = await prisma.dkimrecord.find_many(
        where={'domainSelectorPairId': dsp_record.id},
        order={'firstSeenAt': 'asc'}
    )

    sig_time = sig.timestamp
    if not sig_time:
        logging.info(f'no timestamp for signature {sig.id}')
        return False

    # Check each record to see if the signature falls just before or after its time period
    for record in dkim_records:
        if not record.firstSeenAt or not record.lastSeenAt:
            continue

        # If signature is just before the first seen date
        if sig_time < record.firstSeenAt:
            logging.info(f'signature {sig.id} is just before the first seen date {record.firstSeenAt}')
            # Validate signature with this key
            if record.keyData and await validate_signature(record.keyData, sig):
                # If valid, update firstSeenAt
                await prisma.dkimrecord.update(
                    where={'id': record.id},
                    data={'firstSeenAt': sig_time}
                )
                return True

        # If signature is just after the last seen date  
        if sig_time > record.lastSeenAt:
            logging.info(f'signature {sig.id} is just after the last seen date {record.lastSeenAt}')
            # Validate signature with this key
            if record.keyData and await validate_signature(record.keyData, sig):
                # If valid, update lastSeenAt
                await prisma.dkimrecord.update(
                    where={'id': record.id}, 
                    data={'lastSeenAt': sig_time}
                )
                return True
    return False

async def find_key_for_signature_pair(dsp: Dsp, sig1: EmailSignature, sig2: EmailSignature, prisma: Prisma):
	info = f'dsp {dsp} and signatures {sig1.id} and {sig2.id}'
	logging.info(f'run gcd solver for {info}')
	checked_adjacent_sigs1 = await check_adjacent_sigs(dsp, sig1, prisma)
	checked_adjacent_sigs2 = await check_adjacent_sigs(dsp, sig2, prisma)
	if checked_adjacent_sigs1 or checked_adjacent_sigs2:
    # We break here with or instead of and because if we found only one, the other can't be the same so GCD will fail anyways
		logging.info(f'found public key for sig1 or sig2 by checking adjacent sigs')
		return
	p = find_key(dsp, sig1, sig2, logging.INFO)
	if p:
		logging.info(f'found public key for {info}, TEMPORARY EXIT for testing')
		return
		dsp_record = await prisma.domainselectorpair.find_first(where={'domain': dsp.domain, 'selector': dsp.selector})
		if dsp_record is None:
			dsp_record = await prisma.domainselectorpair.create(data={'domain': dsp.domain, 'selector': dsp.selector, 'sourceIdentifier': 'public_key_gcd_batch'})
			logging.info(f'created domain/selector pair: {dsp.domain} / {dsp.selector}')
		dkimrecord = await prisma.dkimrecord.find_first(where={'domainSelectorPairId': dsp_record.id, 'keyData': p})
		if dkimrecord is None:
			date1 = sig1.timestamp
			date2 = sig2.timestamp
			oldest_date, newest_date = get_date_interval(date1, date2)
			dkimrecord = await prisma.dkimrecord.create(
			    data={
			        'domainSelectorPairId': dsp_record.id,
			        'firstSeenAt': oldest_date or datetime.now(),
			        'lastSeenAt': newest_date or datetime.now(),
			        'value': f'k=rsa; p={p}',
			        'keyType': KeyType.RSA,
			        'keyData': p,
			        'source': 'public_key_gcd_batch',
			    })
			logging.info(f'created dkim record: {dkimrecord}')
		await prisma.emailpairgcdresult.create(data={
		    'emailSignatureA_id': sig1.id,
		    'emailSignatureB_id': sig2.id,
		    'dkimRecordId': dkimrecord.id,
		    'foundGcd': True,
		    'timestamp': datetime.now(),
		})
	else:
		logging.info(f'no public key found for {info}, TEMPORARY EXIT for testing')
		return
		await prisma.emailpairgcdresult.create(data={
		    'emailSignatureA_id': sig1.id,
		    'emailSignatureB_id': sig2.id,
		    'dkimRecordId': None,
		    'foundGcd': False,
		    'timestamp': datetime.now(),
		})

async def check_for_matching_key_period(dsp: Dsp, sig1: EmailSignature, sig2: EmailSignature):
	"""
	Check if two email signatures' timestamps fall within known key periods from archive.prove.email.
	
	Args:
			dsp (Dsp): Domain/selector pair object containing domain and selector
			sig1 (EmailSignature): First email signature to check
			sig2 (EmailSignature): Second email signature to check
			
	Returns:
			bool: True if GCD calculation should proceed (no matching key period found),
						False if matching key period was found and GCD can be skipped
	"""
	# Check if timestamps fall within known key periods from archive.prove.email
	async with httpx.AsyncClient() as client:
		response = await client.get(f"https://archive.prove.email/api/key?domain={dsp.domain}")
		timestamp_1_covered, timestamp_2_covered = False, False
		if response.status_code == 200:
			keys = response.json()
			matching_keys = [k for k in keys if k["selector"] == dsp.selector]
					
			for key in matching_keys:
				first_seen = datetime.fromisoformat(key["firstSeenAt"].replace("Z", "+00:00"))
				last_seen = datetime.fromisoformat(key["lastSeenAt"].replace("Z", "+00:00"))
				
				if sig1.timestamp and first_seen <= sig1.timestamp <= last_seen:
					timestamp_1_covered = True
					try:
						logging.info(f"Validating correct signature {sig1.id} with key {key['keyData']}")
						await validate_signature(key["keyData"], sig1)
					except Exception as e:
						logging.error(f"Signature validation failed: {e}")
				if sig2.timestamp and first_seen <= sig2.timestamp <= last_seen:
					timestamp_2_covered = True
					try:
						logging.info(f"Validating correct signature {sig2.id} with key {key['keyData']}")
						await validate_signature(key["keyData"], sig2)
					except Exception as e:
						logging.error(f"Signature validation failed: {e}")
				if timestamp_1_covered and timestamp_2_covered:
					logging.info(f"Found matching key period for both timestamps of {dsp.domain}:{dsp.selector} " 
											f"({first_seen} to {last_seen})")
					# Validate signatures and exit for testing
					try:
						await validate_signature(key["keyData"], sig1)
						await validate_signature(key["keyData"], sig2)
						logging.info("Signature validation successful")
					except Exception as e:
						logging.error(f"Signature validation failed: {e}")
					finally:
						logging.info("Exiting after signature validation test")
						sys.exit(0)
					# Skip GCD calculation since we found a valid key period
					return False
         
		if not timestamp_1_covered and timestamp_2_covered:
			logging.info(f"No matching key period found for timestamp 1 of {dsp.domain}:{dsp.selector}")
		elif timestamp_1_covered and not timestamp_2_covered:
			logging.info(f"No matching key period found for timestamp 2 of {dsp.domain}:{dsp.selector}")
		elif not timestamp_1_covered and not timestamp_2_covered:
			logging.info(f"No matching key period for either key in {dsp.domain}:{dsp.selector} from timestamps {sig1.timestamp} and {sig2.timestamp}")
		return True

async def main():
	logging.root.name = os.path.basename(__file__)
	logging.getLogger("httpx").setLevel(logging.WARNING)
	logging.basicConfig(level=logging.INFO, format='%(name)s: %(levelname)s: %(message)s')
	prisma = Prisma()
	await prisma.connect()
	email_signatures = await prisma.emailsignature.find_many()
	dspToSigs: DspToSigs = {}
	dspsWithKnownKeys: set[Dsp] = set()
	logging.info(f"filtering out email signatures for which we already have keys")
	for s in email_signatures:
		dsp = Dsp(domain=s.domain, selector=s.selector)
		if dspToSigs.get(dsp) is None:
			dspToSigs[dsp] = []
		dspToSigs[dsp].append(s)

	with tqdm(total=len(dspToSigs), desc="Searching for public keys") as pbar:
		for dsp, sigs in dspToSigs.items():
			if await has_known_keys(prisma, dsp, dspsWithKnownKeys):
				pbar.set_postfix_str(f"Keys known for {dsp.domain} {dsp.selector}")
			else:
				pbar.set_postfix_str(f"Searching {dsp.domain} {dsp.selector}")
			if(dsp.domain == "accounts.google.com"):
				continue
			pbar.update(1)
			if len(sigs) >= 2:
				# Sort signatures by timestamp
				sorted_sigs = sorted(sigs, key=lambda s: s.timestamp if s.timestamp else datetime.max)
				# Go through consecutive pairs
				for i in range(len(sorted_sigs)-1):
					sig1, sig2 = sorted_sigs[i], sorted_sigs[i+1]
					pairGcdResult = await prisma.emailpairgcdresult.find_first(
							where={'OR': [
									{
										'emailSignatureA_id': sig1.id,
										'emailSignatureB_id': sig2.id
								},
								{
										'emailSignatureA_id': sig2.id,
										'emailSignatureB_id': sig1.id
								},
						]})
					if pairGcdResult:
						logging.info(f"EmailPairGcdResult already exists for signatures {sig1.id} and {sig2.id} at timestamp {pairGcdResult.timestamp} but our timestamps are {sig1.timestamp} and {sig2.timestamp}")
						continue
					# logging.info(f"might theoretically run gcd solver for {dsp} and timestamps {sig1.timestamp} and {sig2.timestamp}")
					shouldFindMatch = await check_for_matching_key_period(dsp, sig1, sig2)
					if shouldFindMatch:
						await find_key_for_signature_pair(dsp, sig1, sig2, prisma)
			else:
				logging.info(f"less than 2 signatures found for {dsp}")


if __name__ == '__main__':
	asyncio.run(main())
