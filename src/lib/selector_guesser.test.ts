import { expect, test, vi } from "vitest";
import { findAlternatives } from './selector_guesser'

// Added to bypass db connection during test-execution in ci
vi.mock("./utils_server", () => ({
  addDomainSelectorPair: vi.fn().mockResolvedValue({ added: false }),
}));

const today = new Date(2024, 10, 22);
const currentYear = today.getFullYear().toString();
const previousYear = (today.getFullYear() - 1).toString();

test('findAlternatives regular domain', () => {
	expect(findAlternatives('example.com', `aaa${previousYear}0131ccc`, today)).toStrictEqual([
		{ domain: 'example.com', selector: `aaa${currentYear}1122ccc`, },
	])
	expect(findAlternatives('example.com', `aaa1212${previousYear}ccc`, today)).toStrictEqual([
		{ domain: 'example.com', selector: `aaa1122${currentYear}ccc` },
		{ domain: 'example.com', selector: `aaa2211${currentYear}ccc` },
	])
	expect(findAlternatives('example.com', `aaa1213${previousYear}ccc`, today)).toStrictEqual([
		{ domain: 'example.com', selector: `aaa1122${currentYear}ccc`, },
	])
	expect(findAlternatives('example.com', `aaa1312${previousYear}ccc`, today)).toStrictEqual([
		{ domain: 'example.com', selector: `aaa2211${currentYear}ccc`, },
	])
	expect(findAlternatives('example.com', `aaa1313${previousYear}ccc`, today)).toStrictEqual([
	])
})

test('findAlternatives tries the last week for Google-managed domains', () => {
	const googleDate = new Date(2026, 5, 22);
	expect(findAlternatives('gmail.com', '20230601', googleDate)).toStrictEqual([
		{ domain: 'gmail.com', selector: '20260622' },
		{ domain: 'gmail.com', selector: '20260621' },
		{ domain: 'gmail.com', selector: '20260620' },
		{ domain: 'gmail.com', selector: '20260619' },
		{ domain: 'gmail.com', selector: '20260618' },
		{ domain: 'gmail.com', selector: '20260617' },
		{ domain: 'gmail.com', selector: '20260616' },
	])
})

test('findAlternatives tries the last week for dated Google SMTP domains', () => {
	const googleDate = new Date(2026, 5, 22);
	expect(findAlternatives('sender.20230601.gappssmtp.com', '20230601', googleDate)).toStrictEqual([
		{ domain: 'sender.20260622.gappssmtp.com', selector: '20260622' },
		{ domain: 'sender.20260621.gappssmtp.com', selector: '20260621' },
		{ domain: 'sender.20260620.gappssmtp.com', selector: '20260620' },
		{ domain: 'sender.20260619.gappssmtp.com', selector: '20260619' },
		{ domain: 'sender.20260618.gappssmtp.com', selector: '20260618' },
		{ domain: 'sender.20260617.gappssmtp.com', selector: '20260617' },
		{ domain: 'sender.20260616.gappssmtp.com', selector: '20260616' },
	])
})

test('findAlternatives with date in domain', () => {
	expect(findAlternatives(`mail.${previousYear}0131.example.com`, `aaa${previousYear}0131ccc`, today)).toStrictEqual([
		{ domain: `mail.${currentYear}1122.example.com`, selector: `aaa${currentYear}1122ccc`, },
	])
	expect(findAlternatives(`mail.1212${previousYear}.example.com`, `aaa1212${previousYear}ccc`, today)).toStrictEqual([
		{ domain: `mail.1122${currentYear}.example.com`, selector: `aaa1122${currentYear}ccc`, },
		{ domain: `mail.2211${currentYear}.example.com`, selector: `aaa2211${currentYear}ccc`, },
	])
	expect(findAlternatives(`mail.eee1312${previousYear}fff.example.com`, `aaa1312${previousYear}ccc`, today)).toStrictEqual([
		{ domain: `mail.eee2211${currentYear}fff.example.com`, selector: `aaa2211${currentYear}ccc`, },
	])
})
