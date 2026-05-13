import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as jwkSetRoute from "./jwk_set/route";
import * as domainKeyRoute from "./key/domain/route";
import * as keyRoute from "./key/route";

const mocks = vi.hoisted(() => ({
	addDomainSelectorPair: vi.fn(),
	fetchDkimDnsRecord: vi.fn(),
	findRecords: vi.fn(),
	findRecordsWithCache: vi.fn(),
	getJWKeySetRecord: vi.fn(),
}));

vi.mock("next/headers", () => ({
	headers: () => new Headers(),
}));

vi.mock("@/lib/db", () => ({
	findRecords: mocks.findRecords,
	findRecordsWithCache: mocks.findRecordsWithCache,
	getJWKeySetRecord: mocks.getJWKeySetRecord,
}));

vi.mock("@/lib/utils_server", () => ({
	addDomainSelectorPair: mocks.addDomainSelectorPair,
	fetchDkimDnsRecord: mocks.fetchDkimDnsRecord,
}));

function makeRecord(domain: string, selector: string, value: string) {
	return {
		domainSelectorPair: { domain, selector },
		firstSeenAt: new Date("2024-01-01T00:00:00.000Z"),
		lastSeenAt: new Date("2024-02-01T00:00:00.000Z"),
		value,
	};
}

async function json(response: Response) {
	return await response.json();
}

function makeNextRequest(url: string) {
	return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe("API routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("/api/key rejects requests without a domain", async () => {
		const response = await keyRoute.GET(
			makeNextRequest("https://archive.prove.email/api/key"),
		);

		expect(response.status).toBe(400);
		expect(await json(response)).toBe("missing domain parameter");
		expect(mocks.findRecords).not.toHaveBeenCalled();
	});

	test("/api/key filters archived records by optional selector", async () => {
		mocks.findRecords.mockResolvedValue([
			makeRecord("example.com", "s1", "v=DKIM1; p=one"),
			makeRecord("example.com", "s2", "v=DKIM1; p=two"),
		]);

		const response = await keyRoute.GET(
			makeNextRequest(
				"https://archive.prove.email/api/key?domain=example.com&selector=s2",
			),
		);

		expect(response.status).toBe(200);
		expect(mocks.findRecords).toHaveBeenCalledWith("example.com");
		expect(await json(response)).toStrictEqual([
			{
				domain: "example.com",
				selector: "s2",
				firstSeenAt: "2024-01-01T00:00:00.000Z",
				lastSeenAt: "2024-02-01T00:00:00.000Z",
				value: "v=DKIM1; p=two",
			},
		]);
	});

	test("/api/key/domain returns cached archive records when selector is omitted", async () => {
		mocks.findRecordsWithCache.mockResolvedValue([
			makeRecord("example.com", "s1", "v=DKIM1; p=one"),
		]);

		const response = await domainKeyRoute.GET(
			new Request(
				"https://archive.prove.email/api/key/domain?domain=example.com",
			),
		);

		expect(response.status).toBe(200);
		expect(mocks.findRecordsWithCache).toHaveBeenCalledWith(
			"example.com",
			undefined,
		);
		expect(mocks.fetchDkimDnsRecord).not.toHaveBeenCalled();
		expect(await json(response)).toStrictEqual([
			{
				domain: "example.com",
				selector: "s1",
				firstSeenAt: "2024-01-01T00:00:00.000Z",
				lastSeenAt: "2024-02-01T00:00:00.000Z",
				value: "v=DKIM1; p=one",
			},
		]);
	});

	test("/api/key/domain combines selector DNS results and deduplicates values", async () => {
		mocks.findRecordsWithCache.mockResolvedValue([
			makeRecord("example.com", "s1", "v=DKIM1; p=archive"),
		]);
		mocks.fetchDkimDnsRecord.mockResolvedValue([
			{
				domain: "example.com",
				selector: "s1",
				timestamp: new Date("2024-03-01T00:00:00.000Z"),
				value: "v=DKIM1; p=archive",
			},
			{
				domain: "example.com",
				selector: "s1",
				timestamp: new Date("2024-03-01T00:00:00.000Z"),
				value: "v=DKIM1; p=live",
			},
		]);
		mocks.addDomainSelectorPair.mockResolvedValue({ added: true });

		const response = await domainKeyRoute.GET(
			new Request(
				"https://archive.prove.email/api/key/domain?domain=example.com&selector=s1",
			),
		);

		expect(response.status).toBe(200);
		expect(mocks.findRecordsWithCache).toHaveBeenCalledWith(
			"example.com",
			"s1",
		);
		expect(mocks.fetchDkimDnsRecord).toHaveBeenCalledWith("example.com", "s1");
		expect(mocks.addDomainSelectorPair).toHaveBeenCalledWith(
			"example.com",
			"s1",
			"api",
		);
		expect(await json(response)).toStrictEqual([
			{
				domain: "example.com",
				selector: "s1",
				firstSeenAt: "2024-01-01T00:00:00.000Z",
				lastSeenAt: "2024-02-01T00:00:00.000Z",
				value: "v=DKIM1; p=archive",
			},
			{
				domain: "example.com",
				selector: "s1",
				firstSeenAt: "2024-03-01T00:00:00.000Z",
				lastSeenAt: "2024-03-01T00:00:00.000Z",
				value: "v=DKIM1; p=live",
			},
		]);
	});

	test("/api/jwk_set returns archived JWK sets", async () => {
		mocks.getJWKeySetRecord.mockResolvedValue([
			{
				id: 1,
				jwks: '{"keys":[]}',
				lastUpdated: new Date("2024-04-01T00:00:00.000Z"),
				provenanceVerified: true,
				x509Certificate: "{}",
			},
		]);

		const response = await jwkSetRoute.GET(
			new Request(
				"https://archive.prove.email/api/jwk_set",
			) as unknown as NextRequest,
		);

		expect(response.status).toBe(200);
		expect(await json(response)).toStrictEqual([
			{
				id: 1,
				jwks: '{"keys":[]}',
				lastUpdated: "2024-04-01T00:00:00.000Z",
				provenanceVerified: true,
				x509Certificate: "{}",
			},
		]);
	});
});
