import { afterEach, describe, expect, it, vi } from "vitest";

import { authOptions } from "./auth";

const jwtCallback = authOptions.callbacks.jwt;

describe("auth jwt callback", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not refresh tokens for unauthenticated public sessions", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const token = {};

		await expect(jwtCallback({ token, account: undefined })).resolves.toBe(
			token,
		);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("does not retry refresh requests after a refresh failure", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const token = {
			error: "RefreshAccessTokenError",
			expires_at: 1,
			refresh_token: "stale-refresh-token",
		};

		await expect(jwtCallback({ token, account: undefined })).resolves.toBe(
			token,
		);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
