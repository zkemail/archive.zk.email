import { authOptions } from "@/app/auth";
import { getRequestBaseUrl } from "@/lib/requestBaseUrl";
import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

type NextAuthRouteContext = {
	params: {
		nextauth: string[];
	};
};

process.env.AUTH_TRUST_HOST ??= "true";

const handler = (request: NextRequest, context: NextAuthRouteContext) => {
	const requestBaseUrl = getRequestBaseUrl(request.headers, {
		allowFallback: false,
	});

	if (!requestBaseUrl) {
		return new Response("Untrusted auth host", { status: 400 });
	}

	return NextAuth(authOptions)(request, context);
};

export { handler as GET, handler as POST };
