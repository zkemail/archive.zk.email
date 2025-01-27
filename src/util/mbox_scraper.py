import argparse
import sys
import mailbox

from dkim_util import decode_dkim_tag_value_list


def add_to_dict(dct: dict[str, list[str]], domain: str, selector: str, date: str):
	if (not selector) or (not domain):
		return
	if domain not in dct:
		dct[domain] = []
	entry = f'{selector}:{date}'
	if entry not in dct[domain]:
		dct[domain].append(entry)



def get_domain_selectors(outputDict: dict[str, list[str]], mboxFile: str):
	print(f'processing {mboxFile}', file=sys.stderr)
	for message in mailbox.mbox(mboxFile):
		date = message['Date']         
		dkimSignatures = message.get_all('DKIM-Signature')
		if not dkimSignatures:
			continue
		for dkimSignature in dkimSignatures:
			dkimRecord = decode_dkim_tag_value_list(dkimSignature)
			domain = dkimRecord['d']
			selector = dkimRecord['s']
			add_to_dict(outputDict, domain, selector, date)


def main():
	parser = argparse.ArgumentParser(description='extract domains and selectors from the DKIM-Signature header fields in an mbox file and output them in TSV format')
	parser.add_argument('mbox_file')
	args = parser.parse_args()
	domainSelectorsDict: dict[str, list[str]] = {}
	get_domain_selectors(domainSelectorsDict, args.mbox_file)
	domainSelectorsDict = dict(sorted(domainSelectorsDict.items()))
	for domain, selectors in domainSelectorsDict.items():
		if '\t' in domain:
			print(f'warning: domain {domain} includes a tab character, skipping', file=sys.stderr)
			continue
		for selector in selectors:
			if '\t' in selector:
				print(f'warning: selector {selector} includes a tab character, skipping', file=sys.stderr)
				continue
			print(f'{domain}\t{selector}')


if __name__ == '__main__':
	main()
