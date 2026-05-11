import { describe, expect, test } from "vitest";
import { getGoogleOAuthCallbackUrl, getRequestBaseUrl } from "./requestBaseUrl";

describe("request base URL helpers", () => {
	test("uses the archive.zk.email host in production", () => {
		const headers = new Headers({ host: "archive.zk.email" });

		expect(getRequestBaseUrl(headers, { nodeEnv: "production" })).toBe(
			"https://archive.zk.email",
		);
		expect(getGoogleOAuthCallbackUrl(headers, { nodeEnv: "production" })).toBe(
			"https://archive.zk.email/api/auth/callback/google",
		);
	});

	test("uses the configured Render preview hostname", () => {
		const headers = new Headers({
			"x-forwarded-host": "archive-pr-123.onrender.com",
			"x-forwarded-proto": "https",
			host: "internal-render-host",
		});

		expect(
			getRequestBaseUrl(headers, {
				nodeEnv: "production",
				renderExternalHostname: "https://archive-pr-123.onrender.com",
			}),
		).toBe("https://archive-pr-123.onrender.com");
	});

	test("does not trust every Render hostname", () => {
		const headers = new Headers({
			"x-forwarded-host": "other-app.onrender.com",
			"x-forwarded-proto": "https",
		});

		expect(
			getRequestBaseUrl(headers, {
				fallbackUrl: "https://archive.zk.email",
				nodeEnv: "production",
				renderExternalHostname: "archive-pr-123.onrender.com",
			}),
		).toBe("https://archive.zk.email");
	});

	test("uses http for localhost development", () => {
		const headers = new Headers({ host: "localhost:3000" });

		expect(getRequestBaseUrl(headers, { nodeEnv: "development" })).toBe(
			"http://localhost:3000",
		);
	});

	test("falls back when the request host is not trusted", () => {
		const headers = new Headers({ host: "attacker.example" });

		expect(
			getRequestBaseUrl(headers, {
				fallbackUrl: "https://archive.zk.email/",
				nodeEnv: "production",
			}),
		).toBe("https://archive.zk.email");
	});

	test("can reject an untrusted host without fallback", () => {
		const headers = new Headers({ host: "attacker.example" });

		expect(
			getRequestBaseUrl(headers, {
				allowFallback: false,
				fallbackUrl: "https://archive.zk.email/",
				nodeEnv: "production",
			}),
		).toBeUndefined();
	});
});
