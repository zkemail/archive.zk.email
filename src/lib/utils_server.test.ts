import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execFileSync: vi.fn(() => "openssl output"),
	resolve: vi.fn(),
	setServers: vi.fn(),
}));

vi.mock("dns", () => ({
	default: {
		promises: {
			Resolver: vi.fn(() => ({
				resolve: mocks.resolve,
				setServers: mocks.setServers,
			})),
		},
	},
}));

vi.mock("node:child_process", () => ({
	execFileSync: mocks.execFileSync,
}));

vi.mock("./db", () => ({
	createDkimRecord: vi.fn(),
	dspToString: vi.fn(() => "domain selector pair"),
	prisma: {},
	recordToString: vi.fn(() => "dkim record"),
	updateDspTimestamp: vi.fn(),
}));

vi.mock("./generateWitness", () => ({
	generateWitness: vi.fn(),
}));

import { fetchDkimDnsRecord, getDkimDnsQnames } from "./utils_server";

const dkimValue = "v=DKIM1; k=rsa; p=YWJj";

describe("DKIM DNS lookup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("tries _domainkey and dkim qnames", () => {
		expect(getDkimDnsQnames("example.com", "selector")).toStrictEqual([
			"selector._domainkey.example.com",
			"selector.dkim.example.com",
		]);
	});

	it("falls back to the dkim label when _domainkey lookup fails", async () => {
		mocks.resolve.mockImplementation(async (qname: string) => {
			if (qname === "selector.dkim.example.com") {
				return [[dkimValue]];
			}
			throw new Error("not found");
		});

		const records = await fetchDkimDnsRecord("example.com", "selector");

		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			domain: "example.com",
			selector: "selector",
			value: dkimValue,
			keyType: "RSA",
			keyDataBase64: "YWJj",
		});
		expect(mocks.resolve).toHaveBeenCalledWith(
			"selector._domainkey.example.com",
			"TXT",
		);
		expect(mocks.resolve).toHaveBeenCalledWith(
			"selector.dkim.example.com",
			"TXT",
		);
	});

	it("does not query the dkim label after _domainkey resolves", async () => {
		mocks.resolve.mockResolvedValue([[dkimValue]]);

		const records = await fetchDkimDnsRecord("example.com", "selector");

		expect(records).toHaveLength(1);
		expect(records[0].value).toBe(dkimValue);
		expect(mocks.resolve).toHaveBeenCalledTimes(1);
		expect(mocks.resolve).not.toHaveBeenCalledWith(
			"selector.dkim.example.com",
			"TXT",
		);
	});
});
