This directory contains tools for finding the public RSA keys from pairs of email messages which are signed with the same private key.

## Setup

### Install Python dependencies

```bash
pip3 install pycryptodome
pip3 install gmpy2
```

## Find public RSA keys from en email archive

These commands extract signed data (canonicalized headers) and signatures from each message in an email archive,
and searches for public RSA keys for pairs of messages with the same DKIM domain and selector.

Load mbox files and extract signed data and signatures to corresponding .datasig files:

```bash
python3 extract_signed_data.py --mbox-files inbox1.mbox inbox2.mbox
```

Find public RSA keys from the .datasig files

```bash
python3 find_public_keys.py --datasig-files inbox1.mbox.datasig inbox2.mbox.datasig
```

Run `python3 extract_signed_data.py --help` and `python3 find_public_keys.py --help` for more information.

## Running the reverse engineering script offline

This takes cached signatures and messages, and finds the public key for each pair of signatures. It then uploads the results to the database, and caches the state of all calculations along the way in the database. Note each calculation takes ~22 sec, so we should put that on Modal and run it in the background and from the frontend as well.

Note the cache is missing perms, from both the Olof (correct user) and the postgres user.

```
POSTGRES_PRISMA_URL="<fill here>" python3.10 src/util/pubkey_finder/email_sigs_gcd.py
```

It's odd that the key from accounts.google.com and selector 20230601 does not validate emails from the same domain, since shouldn't that key be deterministic? Current status is that I have no idea why no GCD is found in most cases, even though it should be something like 50%.
