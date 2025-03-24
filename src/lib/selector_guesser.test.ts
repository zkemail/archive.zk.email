import { expect, test, vi } from "vitest";
import { findAlternatives } from './selector_guesser'

// Added to bypass db connection during test-execution in ci
vi.mock("./utils_server", () => ({
  addDomainSelectorPair: vi.fn().mockResolvedValue({ added: false }),
}));

const today = new Date('2024-11-22');
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
