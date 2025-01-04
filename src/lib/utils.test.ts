import { expect, test } from 'vitest'
import { fetchJsonWebKeySet, parseDkimTagList, fetchx509Cert } from "./utils";
import { getLastJWKeySet } from './db';

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

test("jwkStorage", async () => {
	const jwkSet = JSON.parse(await fetchJsonWebKeySet());
	const x509Cert = JSON.parse(await fetchx509Cert());
	// console.log(jwkSet);
	const JwkSet = await getLastJWKeySet();
	expect(JwkSet).not.toBeUndefined();
	expect(JwkSet).not.toBeNull();
	expect(jwkSet).toStrictEqual(JSON.parse(JwkSet!.jwks));
	expect(x509Cert).toStrictEqual(JSON.parse(JwkSet!.x509Certificate));
});
