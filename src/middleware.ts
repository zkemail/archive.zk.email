import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
	"Access-Control-Max-Age": "86400",
};

export function middleware(request: NextRequest) {
	// Handle preflight OPTIONS requests
	if (request.method === "OPTIONS") {
		return new NextResponse(null, {
			status: 204,
			headers: corsHeaders,
		});
	}

	// Handle standard requests - add CORS headers to response
	const response = NextResponse.next();

	Object.entries(corsHeaders).forEach(([key, value]) => {
		response.headers.set(key, value);
	});

	return response;
}

export const config = {
	matcher: "/api/:path*",
};
