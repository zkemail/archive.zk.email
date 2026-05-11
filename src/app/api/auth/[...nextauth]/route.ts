import { authOptions } from "@/app/auth";
import { getRequestBaseUrl } from "@/lib/requestBaseUrl";
import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

const handler = (request: NextRequest) => {
	const requestBaseUrl = getRequestBaseUrl(request.headers);

	if (requestBaseUrl) {
		process.env.NEXTAUTH_URL = requestBaseUrl;
	}

	return NextAuth(authOptions)(request);
};

export { handler as GET, handler as POST };
