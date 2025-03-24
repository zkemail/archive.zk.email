import binascii
import json
import logging
import os
import time
from typing import Any
from common import first_n_primes
import gmpy2  # type: ignore

gmpy2_mpz: Any = gmpy2.mpz  # type: ignore
gmpy2_gcd: Any = gmpy2.gcd  # type: ignore

# https://blog.ploetzli.ch/2018/calculating-an-rsa-public-key-from-two-signatures/


def pkcs1_padding(size_bytes: int, hash_hex: str, hashfn: str):
	oid = {'sha256': '608648016503040201', 'sha512': '608648016503040203'}[hashfn]
	result = '06' + ("%02X" % (len(oid) // 2)) + oid + '05' + '00'
	result = '30' + ("%02X" % (len(result) // 2)) + result

	result = result + '04' + ("%02X" % (len(hash_hex) // 2)) + hash_hex
	result = '30' + ("%02X" % (len(result) // 2)) + result

	result = '0001' + ('ff' * int(size_bytes - 3 - len(result) / 2)) + '00' + result
	return result


def message_sig_pair(size_bytes: int, hash_hex: str, signature: bytes, hashfn: str) -> tuple[Any, Any]:
	message = gmpy2_mpz('0x' + pkcs1_padding(size_bytes, hash_hex, hashfn))
	signature = gmpy2_mpz('0x' + binascii.hexlify(signature).decode('utf-8'))
	return (message, signature)


def remove_small_prime_factors(n: Any):
	for p in first_n_primes(1500):
		while n % p == 0:
			logging.debug(f'removing small prime factor {p}')
			n = n // p
	return n


def find_n(message_hashes_hex: list[str], signatures: list[bytes], hashfn: str) -> tuple[int, int]:
	size_bytes = len(signatures[0])
	if any(len(s) != size_bytes for s in signatures):
		logging.error(f"all signature sizes must be identical")
		return 0, 0

	if len(set(signatures)) != len(signatures):
		logging.error(f"duplicate signatures found")
		return 0, 0

	if True:
		pairs = [message_sig_pair(size_bytes, m, s, hashfn) for (m, s) in zip(message_hashes_hex, signatures)]
		for e in [0x10001, 3, 17]:
			logging.debug(f'solving for hashfn={hashfn}, e={e}')
			gcd_input = [(s**e - m) for (m, s) in pairs]

			start_time = time.process_time()
			n: Any = gmpy2_gcd(*gcd_input)
			logging.info(f'gcd cpu time={time.process_time() - start_time} and n bits={n.bit_length()} and size of inputs in gcd_input={gcd_input[0].bit_length(), gcd_input[1].bit_length()}')

			if n.bit_length() > 10000:
				logging.error(f'skip n with > 10000 bits')
				continue

			n = remove_small_prime_factors(n)
			logging.debug(f'result n=({n.bit_length()} bit number)')

			if n > 1:
				logging.info(f'found gcd for hashfn={hashfn}, e={e}, n={n}')
				return (int(n), int(e))
	return 0, 0


if __name__ == '__main__':
	import argparse
	parser = argparse.ArgumentParser()
	parser.add_argument('msg1_hash_hex')
	parser.add_argument('signature1_base64')
	parser.add_argument('msg2_hash_hex')
	parser.add_argument('signature2_base64')
	parser.add_argument('hashfn', choices=['sha256', 'sha512'])
	parser.add_argument('--loglevel', type=int, default=logging.INFO)
	args = parser.parse_args()
	msg1_hash_hex = args.msg1_hash_hex
	msg2_hash_hex = args.msg2_hash_hex
	signature1 = binascii.a2b_base64(args.signature1_base64)
	signature2 = binascii.a2b_base64(args.signature2_base64)
	hashfn = args.hashfn
	logging.root.name = os.path.basename(__file__)
	logging.basicConfig(level=args.loglevel, format='%(name)s: %(levelname)s: %(message)s')
	n, e = find_n([msg1_hash_hex, msg2_hash_hex], [signature1, signature2], hashfn)
	print(json.dumps({'n_hex': hex(n), 'e_hex': hex(e)}))
