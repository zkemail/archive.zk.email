import { expect, test } from 'vitest'
import { parseDkimTagList } from './utils';

test('parseDkimTagList', () => {
	expect(parseDkimTagList(' k=rsa;b=c; =foo   ; hello; b=duplicate_value_for_b; p=abcd12345;;;k2=v2')).toStrictEqual({
		k: 'rsa',
		p: 'abcd12345',
		b: 'c',
		k2: 'v2',
	});

	expect(parseDkimTagList('')).toStrictEqual({});

	const tagList = parseDkimTagList('a=b; c=d');
	expect(tagList.a).toBe('b');
	expect(tagList.hasOwnProperty('c')).toBe(true);
	expect(tagList.hasOwnProperty('f')).toBe(false);
})
