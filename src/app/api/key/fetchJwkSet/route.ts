// /api/key/fetchJwkSet

import { getJWKeySetRecord } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { checkRateLimiter } from "@/lib/utils";

const rateLimiter = new RateLimiterMemory({ points: 5, duration: 10 });

export async function GET(request: NextRequest) {
  try {
    await checkRateLimiter(rateLimiter, headers(), 1);
  } catch (error: any) {
    return NextResponse.json("Rate limit exceeded", { status: 429 });
  }

  try {
    const JwkSet = await getJWKeySetRecord();
    return NextResponse.json(JwkSet, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(error.toString(), { status: 500 });
  }
}
