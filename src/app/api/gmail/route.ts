import { authOptions } from "@/app/auth";
import { type DomainAndSelector, getDkimSigsArray, parseDkimTagListV2, parseEmailHeaderV2 } from "@/lib/utils";
import { type gmail_v1, google } from "googleapis";
import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { type AddResult, addDomainSelectorPair } from "@/lib/utils_server";
import { processAndStoreEmailSignature } from "@/lib/store_email_signature";
import { headers } from 'next/headers';

async function handleMessage(
  messageId: string,
  gmail: gmail_v1.Gmail,
  resultArray: AddDspResult[]
) {
  const messageRes = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "raw",
  });
  const encodedEmailRaw = messageRes.data.raw;
  const decodedEmailRaw = Buffer.from(encodedEmailRaw!, "base64").toString(
    "utf-8"
  );

  // Fix from here :- upto wherever you want to...
  const headers = parseEmailHeaderV2(decodedEmailRaw);
  if (!headers) {
    throw "missing headers";
  }
  let internalDate: Date | null = new Date(
    Number(messageRes.data.internalDate)
  );
  internalDate =
    internalDate instanceof Date && !isNaN(internalDate.getTime())
      ? internalDate
      : null;


  const dkimSigsArray: string[] = getDkimSigsArray(decodedEmailRaw);

  for (const dkimSig of dkimSigsArray) {
    if (!dkimSig) {
      console.log("missing DKIM-Signature value", dkimSig);
      continue;
    }
    const tags = parseDkimTagListV2(dkimSig);

    const domain = tags.d;
    if (!domain) {
      console.log("missing d tag", tags);
      continue;
    }
    const selector = tags.s;
    if (!selector) {
      console.log("missing s tag", tags);
      continue;
    }
    const addResult = await addDomainSelectorPair(domain, selector, "api");

    // If DNS check fails, and dkim key is not in DB, we calcualte gcd via calling the processAndStoreEmailSignature function else we store the email signature
    await processAndStoreEmailSignature(
      headers,
      dkimSig,
      tags,
      internalDate,
      decodedEmailRaw,
      addResult
    );

    const domainSelectorPair = { domain, selector };
    resultArray.push({
      addResult,
      domainSelectorPair,
      mailTimestamp: internalDate?.toString(),
    });
  }
  return resultArray;
}

type AddDspResult = {
  addResult: AddResult;
  domainSelectorPair: DomainAndSelector;
  mailTimestamp?: string;
};

export type GmailResponse = {
  messagesProcessed: number;
  messagesTotal?: number;
  addDspResults: AddDspResult[];
  nextPageToken: string | null;
};

async function handleRequest(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return new Response("Unauthorized. Sign in via api/auth/signin", {
      status: 401,
    });
  }

  const token = await getToken({ req: request });
  const access_token = token?.access_token as string | undefined;
  if (!access_token) {
    return NextResponse.json("Missing access_token", { status: 403 });
  }
  const headersList = await headers();
  const host = headersList.get('host');
  const baseUrl = process.env.NODE_ENV === 'development' ? `http://${host}/api/auth/callback/google` : `https://${host}/api/auth/callback/google`;
  const clientId = process.env.IS_PULL_REQUEST == "true" ? process.env.PREVIEW_GOOGLE_CLIENT_ID : process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.IS_PULL_REQUEST == "true" ? process.env.PREVIEW_GOOGLE_CLIENT_SECRET : process.env.GOOGLE_CLIENT_SECRET;
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    baseUrl,
  );
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  oauth2Client.setCredentials({ access_token });

  const pageToken = request.nextUrl.searchParams.get("pageToken");
  const gmailQuery = request.nextUrl.searchParams.get("gmailQuery");
  const isFirstPage = !pageToken;
  const messagesTotal = isFirstPage
    ? (await gmail.users.getProfile({ userId: "me" })).data.messagesTotal
    : null;
  const messageTotalParam = messagesTotal ? { messagesTotal } : {};

  const listParams: any = {
    userId: "me",
    maxResults: 10,
  };

  if (gmailQuery) {
    listParams.q = gmailQuery;
  }

  if (pageToken) {
    listParams.pageToken = pageToken;
  }

  const listResults = await gmail.users.messages.list(listParams);

  console.log("listResults", listResults);

  const messages = listResults?.data?.messages || [];
  console.log("messages", messages);
  const addDspResults: AddDspResult[] = [];
  console.log(`handling ${messages.length} messages`);
  for (const message of messages) {
    if (!message.id) {
      console.log(`no messageId for message`, message);
      continue;
    }
    try {
      await handleMessage(message.id, gmail, addDspResults);
    } catch (e) {
      console.log(`error handling message ${message.id}`, e);
    }
  }
  const nextPageToken = listResults.data.nextPageToken || null;
  const messagesProcessed = messages.length;
  const response: GmailResponse = {
    addDspResults,
    nextPageToken,
    messagesProcessed,
    ...messageTotalParam,
  };
  return NextResponse.json(response, { status: 200 });
}

export async function GET(request: NextRequest) {
  try {
    return await handleRequest(request);
  } catch (error: any) {
    console.log("handleRequest error ", error);
    return NextResponse.json(error.toString(), { status: 500 });
  }
}
