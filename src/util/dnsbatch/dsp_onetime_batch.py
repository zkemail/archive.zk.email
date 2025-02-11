#!.venv/bin/python
# this tool searches for DKIM DNS records for each combination of domains and selectors in the provided input files

# prerequisites: install the Modal Python package, see https://modal.com/docs/guide
#
# pip install modal
# pip install dnspython
#
# example remote run:
# modal run dsp_onetime_batch.py --domains-filename domains.txt --selectors-filename selectors.txt --no-sparse > output.txt
#
# example local run:
# python dsp_onetime_batch.py --domains-filename domains.txt --selectors-filename selectors.txt > output.txt
#

import argparse
import datetime
import sys
import time
import modal

stub = modal.Stub("dsp-onetime-batch")
dns_image = (modal.Image.debian_slim(python_version="3.10").pip_install("dnspython"))


def parse_tags(txtData: str) -> dict[str, str]:
	dkimData: dict[str, str] = {}
	for tag in txtData.split(';'):
		tag = tag.strip()
		if not tag:
			continue
		try:
			key, value = tag.split('=', maxsplit=1)
			dkimData[key] = value
		except ValueError:
			#print(f'warning: invalid tag: {tag}, {txtData}')
			continue
		dkimData[key] = value
	return dkimData


def resolve_qname(domain: str, selector: str):
	import dns.exception
	import dns.resolver
	import dns.rdatatype

	qname = f"{selector}._domainkey.{domain}"

	try:
		response = dns.resolver.resolve(qname, dns.rdatatype.TXT)
		if len(response) == 0:
			#print(f'warning: no records found for {qname}')
			return
		txtData = ""
		for i in range(len(response)):
			txtData += b''.join(response[i].strings).decode()  # type: ignore
			txtData += ";"
		tags = parse_tags(txtData)
		if 'p' not in tags:
			#print(f'warning: no p= tag found for {qname}, {txtData}')
			return
		if tags['p'] == "":
			#print(f'warning: empty p= tag found for {qname}, {txtData}')
			return
		if tags['p'] in ["reject", "none"]:
			#print(f'info: p=reject found for {qname}, {txtData}')
			return
		if len(tags['p']) < 10:
			print(f'# short p= tag found for {qname}, {txtData}\n')
			return
		tsv_row = f'DNS_BATCH_RESULT,{domain},{selector},{txtData}\n'  # extra newline at the end as a workaround for that the stdout from modal.com somtimes has merged lines if there is just one newline
		print(tsv_row)
		return txtData
	except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers, dns.exception.Timeout) as _e:
		#print(f'warning: dns resolver error: {e}')
		pass


def process_domain(domain: str, selectors: list[str]):
	for selector in selectors:
		resolve_qname(domain, selector)


@stub.function(image=dns_image)  # type: ignore
def process_domain_wrapper(domain: str, selectors: list[str]):
	process_domain(domain, selectors)


def run_batch_job(domains_filename: str, selectors_filename: str, *, local: bool = False, sparse: bool = False):
	with open(selectors_filename) as f:
		selectors = f.read().splitlines()
	with open(domains_filename) as f:
		domains = f.read().splitlines()
	if sparse:
		domains = domains[0::1000]
	start_time = time.time()
	print(f"started at {datetime.datetime.fromtimestamp(start_time).isoformat(' ', timespec='seconds')}", file=sys.stderr)
	for index, domain in enumerate(domains):
		elapsed_hrs = (time.time() - start_time) / 3600
		time_left_hrs = ((len(domains) - index) * elapsed_hrs / index) if index > 0 else 0
		print(f"processing domain {index}, elapsed: {elapsed_hrs:.2f}, time left: {time_left_hrs:.2f} hours, {domain}", file=sys.stderr)
		if local:
			process_domain(domain, selectors)
		else:
			process_domain_wrapper.spawn(domain, selectors)


# remote entrypoint
@stub.local_entrypoint()  # type: ignore
def main(domains_filename: str, selectors_filename: str, sparse: bool):
	run_batch_job(domains_filename, selectors_filename, sparse=sparse)


# local entrypoint
if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument('--domains-filename', type=str)
	parser.add_argument('--selectors-filename', type=str)
	args = parser.parse_args()
	run_batch_job(args.domains_filename, args.selectors_filename, local=True)
