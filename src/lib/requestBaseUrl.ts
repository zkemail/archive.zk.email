type HeaderGetter = {
	get(name: string): string | null;
};

type RequestBaseUrlOptions = {
	allowFallback?: boolean;
	fallbackUrl?: string;
	nodeEnv?: string;
	renderExternalHostname?: string;
};

const TRUSTED_HOSTS = new Set([
	"archive.prove.email",
	"archive.zk.email",
	"localhost",
	"127.0.0.1",
]);

function firstHeaderValue(value: string | null): string | undefined {
	return value?.split(",")[0]?.trim() || undefined;
}

function hostnameWithoutPort(host: string): string {
	return host.replace(/:\d+$/, "").toLowerCase();
}

function configuredHostname(host: string | undefined): string | undefined {
	if (!host) {
		return undefined;
	}

	try {
		return hostnameWithoutPort(
			host.includes("://") ? new URL(host).host : host,
		);
	} catch {
		return hostnameWithoutPort(host);
	}
}

function isTrustedHost(
	host: string,
	nodeEnv?: string,
	renderExternalHostname?: string,
): boolean {
	const hostname = hostnameWithoutPort(host);

	if (TRUSTED_HOSTS.has(hostname)) {
		return true;
	}

	if (nodeEnv === "development") {
		return true;
	}

	return hostname === configuredHostname(renderExternalHostname);
}

function inferProtocol(host: string, nodeEnv?: string): "http" | "https" {
	const hostname = hostnameWithoutPort(host);

	if (
		nodeEnv === "development" ||
		hostname === "localhost" ||
		hostname === "127.0.0.1"
	) {
		return "http";
	}

	return "https";
}

function forwardedProtocol(
	headers: HeaderGetter,
): "http" | "https" | undefined {
	const protocol = firstHeaderValue(headers.get("x-forwarded-proto"));

	return protocol === "http" || protocol === "https" ? protocol : undefined;
}

export function getRequestBaseUrl(
	headers: HeaderGetter,
	options: RequestBaseUrlOptions = {},
): string | undefined {
	const allowFallback = options.allowFallback ?? true;
	const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
	const fallbackUrl = options.fallbackUrl ?? process.env.NEXTAUTH_URL;
	const renderExternalHostname =
		options.renderExternalHostname ??
		process.env.RENDER_EXTERNAL_HOSTNAME ??
		process.env.RENDER_EXTERNAL_URL;
	const host =
		firstHeaderValue(headers.get("x-forwarded-host")) ??
		firstHeaderValue(headers.get("host"));

	if (!host || !isTrustedHost(host, nodeEnv, renderExternalHostname)) {
		return allowFallback ? fallbackUrl?.replace(/\/$/, "") : undefined;
	}

	const protocol = forwardedProtocol(headers) ?? inferProtocol(host, nodeEnv);

	return `${protocol}://${host}`;
}

export function getGoogleOAuthCallbackUrl(
	headers: HeaderGetter,
	options: RequestBaseUrlOptions = {},
): string | undefined {
	const baseUrl = getRequestBaseUrl(headers, options);

	return baseUrl ? `${baseUrl}/api/auth/callback/google` : undefined;
}
