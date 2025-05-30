import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import type { RateLimiterMemory } from "rate-limiter-flexible";
import type { KeyType } from "@prisma/client";

export type DomainAndSelector = {
	domain: string,
	selector: string
};

export type jwkSet = {
	id: number;
  	x509Certificate: string;
  	jwks: string;
  	lastUpdated: Date;
  	provenanceVerified: boolean | null;
}

export interface DnsDkimFetchResult {
	domain: string;
	selector: string;
	value: string;
	timestamp: Date;
	keyType: KeyType;
	keyDataBase64: string | null;
}


export function kValueToKeyType(s: string | null | undefined): KeyType {
	if (s === null || s === undefined) {
		// if k is not specified, RSA is implied, see https://datatracker.ietf.org/doc/html/rfc6376#section-3.6.1
		return 'RSA';
	}
	if (s.toLowerCase() === 'rsa') {
		return 'RSA';
	}
	if (s.toLowerCase() === 'ed25519') {
		return 'Ed25519';
	}
	throw new Error(`Unknown key type: "${s}"`);
}

// relaxed implementation of Tag=Value List, see https://datatracker.ietf.org/doc/html/rfc6376#section-3.2
export function parseDkimTagList(dkimValue: string): Record<string, string> {
	const result: Record<string, string> = {};
	const parts = dkimValue.split(';').map(part => part.trim());
	for (const part of parts) {
		const i = part.indexOf('=');
		if (i <= 0) {
			continue;
		}
		const key = part.slice(0, i).trim();
		const value = part.slice(i + 1).trim();
		if (result.hasOwnProperty(key)) {
			// duplicate key, keep the longer value
			if (value.length > result[key].length) {
				result[key] = value;
			}
			continue;
		}
		result[key] = value;
	}
	return result;
}

export function load_domains_and_selectors_from_tsv(fileContent: string): DomainAndSelector[] {
	const result = [];
	const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line);
	for (let i = 0; i < lines.length; i++) {
		const [domain, selector] = lines[i].split('\t');
		if (!selector || !domain) {
			console.error(`error: line ${i}, selector or domain is empty`);
			continue;
		}
		result.push({ domain, selector });
	}
	return result;
}

export function getCanonicalRecordString(dsp: DomainAndSelector, dkimRecordValue: string): string {
	return `${dsp.selector}._domainkey.${dsp.domain} TXT "${dkimRecordValue}"`;
}

// Canonicalize X.509 certificates
function canonicalizeX509(certString: string): string {
  const certs = JSON.parse(certString);
  const sortedEntries = Object.entries(certs)
    .sort(([a], [b]) => a.localeCompare(b));
  
  const sortedCerts = Object.fromEntries(sortedEntries);
  return JSON.stringify(sortedCerts, Object.keys(sortedCerts).sort());
}

// Canonicalize JWKS
function canonicalizeJwks(jwksString: string): string {
  const jwks = JSON.parse(jwksString);
  
  const sortedKeys = jwks.keys.sort((a: any, b: any) => 
    a.kid.localeCompare(b.kid)
  );
  
  const canonicalKeys = sortedKeys.map((key: any) => {
    const orderedKey: Record<string, any> = {};
    Object.keys(key)
      .sort()
      .forEach(k => orderedKey[k] = key[k]);
    return orderedKey;
  });
  return JSON.stringify({ keys: canonicalKeys }, null, 0);
}

export function getCanonicalJWKRecordString(
  jwkSet: jwkSet 
): string {
	const canonicalX509 = canonicalizeX509(jwkSet.x509Certificate);
    const canonicalJwks = canonicalizeJwks(jwkSet.jwks);
  
	const canonicalObject = {
    x509Certificate: canonicalX509,
    jwks: canonicalJwks,
    lastUpdated: jwkSet.lastUpdated,
    provenanceVerified: jwkSet.provenanceVerified,
  };
  
  return JSON.stringify(canonicalObject, Object.keys(canonicalObject).sort());
}

function dataToMessage(data: any): string {
	if (!data) {
		return '';
	}
	if (data?.message) {
		return `${data.message}`;
	}
	if (data instanceof Object) {
		return JSON.stringify(data);
	}
	return `${data}`;
}

export function axiosErrorMessage(error: any): string {
	if (error.response) {
		const data = error?.response?.data;
		const message = dataToMessage(data);
		return `${error} - ${message}`;
	}
	else {
		return `${error.message}`;
	}
}

export async function checkRateLimiter(rateLimiter: RateLimiterMemory, headers: ReadonlyHeaders, consumePoints: number) {
	const forwardedFor = headers.get("x-forwarded-for");
	if (forwardedFor) {
		const clientIp = forwardedFor.split(',')[0];
		await rateLimiter.consume(clientIp, consumePoints);
	}
}

export function isValidDate(year: number, month: number, day: number) {
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function truncate(s: string, maxLength: number) {
	if (s.length > maxLength) {
		return s.slice(0, Math.max(maxLength, 3) - 3) + "...";
	} else {
		return s;
	}
}

export const DspSourceIdentifiers = ['top_1m_lookup', 'api', 'selector_guesser', 'seed', 'try_selectors', 'api_auto', 'scraper', 'public_key_gcd_batch', 'unknown'] as const;
export type DspSourceIdentifier = typeof DspSourceIdentifiers[number];

export function stringToDspSourceIdentifier(s: string): DspSourceIdentifier {
	const sourceIdentifier = DspSourceIdentifiers.find(id => id === s);
	if (sourceIdentifier) {
		return sourceIdentifier;
	}
	return 'unknown';
}

export const KeySourceIdentifiers = ['public_key_gcd_batch', 'unknown'] as const;
export type KeySourceIdentifier = typeof KeySourceIdentifiers[number];

export function stringToKeySourceIdentifier(s: string): KeySourceIdentifier {
	const sourceIdentifier = KeySourceIdentifiers.find(id => id === s);
	if (sourceIdentifier) {
		return sourceIdentifier;
	}
	return 'unknown';
}


export function dspSourceIdentifierToHumanReadable(sourceIdentifierStr: string) {
	switch (stringToDspSourceIdentifier(sourceIdentifierStr)) {
		case 'top_1m_lookup':
		case 'scraper':
			return 'Scraped';
		case 'api':
			return 'Inbox upload';
		case 'api_auto':
			return 'Inbox upload';
		case 'selector_guesser':
			return 'Selector guesser';
		case 'seed':
			return 'Seed';
		case 'try_selectors':
			return 'Try selectors';
		case 'public_key_gcd_batch':
			return 'Mail archive';
		case 'unknown':
			return 'Unknown';
	}
}


export function keySourceIdentifierToHumanReadable(sourceIdentifierStr: string) {
	switch (stringToKeySourceIdentifier(sourceIdentifierStr)) {
		case 'public_key_gcd_batch':
			return 'Reverse engineered';
		case 'unknown':
			return 'Unknown';
	}
}

export function parseEmailHeader(
  text: string
): Record<string, string | string[]> {
  const lines = text.split("\n");
  const json: Record<string, string | string[]> = {};

  let currentKey = "";
  let currentValue = "";
  let boundaryCount = 0;
  let isBody = false;
  let boundaryValue = "";

  for (const line of lines) {
    if (isBody) {
      if (!json["body"]) {
        json["body"] = "";
      }
      json["body"] += line + "\n";
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z-]+):\s/);
    if (keyMatch) {
      if (currentKey) {
        if (json[currentKey]) {
          if (Array.isArray(json[currentKey])) {
            (json[currentKey] as string[]).push(currentValue.trim());
          } else {
            json[currentKey] = [
              json[currentKey] as string,
              currentValue.trim(),
            ];
          }
        } else {
          json[currentKey] = currentValue.trim();
        }
      }

      const key = keyMatch[1];
      const value = line.slice(keyMatch[0].length).trim();
      currentKey = key;
      currentValue = value;
    } else if (currentKey) {
      currentValue += " " + line.trim();
    }
    if (!boundaryValue && currentKey == "Content-Type") {
      const boundaryMatch = line.match(/boundary=([^\s;]+)/);
      if (boundaryMatch) {
        boundaryValue = boundaryMatch[1].trim();
      }
    }

    if (boundaryValue && line.includes(boundaryValue)) {
      boundaryCount++;
      isBody = true;
    }
  }

  if (currentKey) {
    if (json[currentKey]) {
      if (Array.isArray(json[currentKey])) {
        (json[currentKey] as string[]).push(currentValue.trim());
      } else {
        json[currentKey] = [json[currentKey] as string, currentValue.trim()];
      }
    } else {
      json[currentKey] = currentValue.trim();
    }
  }

  return json;
}
export async function fetchJsonWebKeySet(): Promise<string> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!response.ok) {
      throw new Error('Cannot fetch Google JSON Web Key Set');
    }
    const jsonData = await response.json();
	console.log(jsonData);
    const jsonWebKeySet = JSON.stringify(
      jsonData,
      null,
      2
    );
    return jsonWebKeySet;
  } catch (error) {
    console.error('Error fetching JSON Web Key Set:', error);
    return "";
  }
}

export async function fetchx509Cert(): Promise<string> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/certs');
    if (!response.ok) {
      throw new Error('Cannot fetch Google X.509 certificate');
    }
    const jsonData = await response.json();
	const x509Cert = JSON.stringify(jsonData,  Object.keys(jsonData).sort(), 2);
    return x509Cert;
  } catch (error) {
    console.error('Error fetching X.509 certificate:', error);
    return "";
  }
}