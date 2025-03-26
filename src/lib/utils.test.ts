import { expect, test } from "vitest";
import { fetchJsonWebKeySet, parseDkimTagList, fetchx509Cert } from "./utils";
import { getLastJWKeySet } from "./db";
test("parseDkimTagList", () => {
  expect(
    parseDkimTagList(
      "v=1; k=rsa;b=c; =foo   ; hello; b=duplicate_value_for_b; p=DKIM1; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArkIVR9VjV+E605cxGymoapBUHX1ooeEFTJv9xCKgXQIgvAORT8BgzwGSYHMT/PFrVaHa3+6ESNKaSnPTIlVOWTddkOBBxlGz1+r/TEnCgD9JMD/0oHzQDj5v9+f+yMfcZo9Co1gH8Z23zvbI1ArO+YsBTAFuh4arIRVSzw+zTvrWZ/E9/sp71jaH4lrR+aLFhI2j3QN/jzugfBl/T+pHQlePJmlBGs9a7pkyMfQB1oYULdoxrxKoYob1GL7kdsMH5kqvvK8UyW2z1/3AhSoZAsFvjzuZUL182rhxZAAmP6n8u/o7Xugp7Ije+aEXXKBiZkqS9qNbDRjEkn2FaL/xkQIDAQAB;;;k2=v2"
    )
  ).toStrictEqual({
    v: "1",
    k: "rsa",
    p: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArkIVR9VjV+E605cxGymoapBUHX1ooeEFTJv9xCKgXQIgvAORT8BgzwGSYHMT/PFrVaHa3+6ESNKaSnPTIlVOWTddkOBBxlGz1+r/TEnCgD9JMD/0oHzQDj5v9+f+yMfcZo9Co1gH8Z23zvbI1ArO+YsBTAFuh4arIRVSzw+zTvrWZ/E9/sp71jaH4lrR+aLFhI2j3QN/jzugfBl/T+pHQlePJmlBGs9a7pkyMfQB1oYULdoxrxKoYob1GL7kdsMH5kqvvK8UyW2z1/3AhSoZAsFvjzuZUL182rhxZAAmP6n8u/o7Xugp7Ije+aEXXKBiZkqS9qNbDRjEkn2FaL/xkQIDAQAB",
    b: "duplicate_value_for_b",
    k2: "v2",
  });

  expect(parseDkimTagList("")).toStrictEqual({});

  const tagList = parseDkimTagList("v=1; v=DKIM1; a=b; c=d");
  expect(tagList.a).toBe("b");
  expect(tagList.v).toBe("DKIM1");
  expect(tagList.hasOwnProperty("c")).toBe(true);
  expect(tagList.hasOwnProperty("f")).toBe(false);
});

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
