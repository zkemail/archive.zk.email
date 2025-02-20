import sys
import argparse
import pypff
import email.parser
from dataclasses import dataclass
from typing import cast, Any, Union
from dkim_util import decode_dkim_tag_value_list


@dataclass
class Property:
	entry_type: int
	value_type: int

	def match(self, entry_type: int, value_type: int):
		return self.entry_type == entry_type and self.value_type == value_type


# https://github.com/libyal/libfmapi/blob/main/documentation/MAPI%20definitions.asciidoc
PR_TRANSPORT_MESSAGE_HEADERS = Property(0x007d, 0x001f)

dsps: set[str] = set()


def parse_header(data: str):
	h = email.parser.HeaderParser().parsestr(data)
	dkim_fields = h.get_all('DKIM-Signature')
	email_date = h.get('Date')
	if not dkim_fields:
		return
	for dkim_field in dkim_fields:
		dkimRecord = decode_dkim_tag_value_list(dkim_field)
		domain = dkimRecord['d']
		selector = dkimRecord['s']
		formatted_date = email_date.strip()
		descriptor = f"{selector}:{formatted_date}"
		dsps.add(f'{domain}\t{descriptor}')


def parse_message(msg: pypff.message) -> None:
	for record_set in msg.record_sets:
		for entry in record_set.entries:
			if (PR_TRANSPORT_MESSAGE_HEADERS.match(entry.get_entry_type(), entry.get_value_type())):
				unicode16_data = cast(bytes, entry.get_data())
				header_data = unicode16_data.decode('utf-16')
				parse_header(header_data)


def parse_item(index: int, item: Union[pypff.message, pypff.folder, Any], depth: int) -> None:
	indent = '    ' * depth
	if isinstance(item, pypff.message):
		print(f'{indent}{type(item)} {index}: "{item.subject}"', file=sys.stderr)
		parse_message(item)
	else:
		if isinstance(item, pypff.folder):
			print(f'{indent}{type(item)} {index}: "{item.name}"', file=sys.stderr)
		else:
			print(f'{indent}{type(item)} {index}', file=sys.stderr)
		if hasattr(item, 'sub_items') and item.sub_items is not None:
			for i in range(len(item.sub_items)):
				sub_item = item.sub_items[i]
				parse_item(i, sub_item, depth + 1)


def decode_pst() -> None:
	parser = argparse.ArgumentParser(description='extract domains and selectors from the DKIM-Signature header fields in a PST file and output them in TSV format')
	parser.add_argument('pst_file')
	args = parser.parse_args()
	pst = pypff.file()
	pst.open(args.pst_file)
	parse_item(0, pst.get_root_folder(), 0)
	pst.close()


if __name__ == '__main__':
	decode_pst()
	for dsp in dsps:
		print(dsp)
