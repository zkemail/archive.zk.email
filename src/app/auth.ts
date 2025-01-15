import { Session as NextAuthSession, TokenSet } from "next-auth"

// Define our custom session properties
export interface CustomSession {
	error?: string;
	has_gmail_scope?: boolean;
	has_gmail_readonly?: boolean;
	has_gmail_metadata?: boolean;
	expires: string;
	user?: {
		email?: string | null;
		name?: string | null;
		image?: string | null;
	};
}

// Use type assertion to combine NextAuth Session with our custom properties
export type Session = CustomSession;
import GoogleProvider from "next-auth/providers/google"

// https://authjs.dev/guides/basics/refresh-token-rotation?frameworks=core

export const authOptions = {
	providers: [
		GoogleProvider({
			clientId: process.env.GOOGLE_CLIENT_ID || '',
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
			authorization: {
				params: {
					prompt: "consent",
					access_type: "offline",
					// Default to metadata scope, can be overridden by client-side signIn
					scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.metadata',
				},
			},
		}),
	],
	callbacks: {
		async jwt({ token, account }: { token: any, account: any }) {
			if (account) {
				token.access_token = account.access_token
				token.refresh_token = account.refresh_token
				token.expires_at = Math.floor(Date.now() / 1000 + account.expires_in)
				return token

			}
			else if (Date.now() < token.expires_at * 1000) {
				return token
			}
			else {
				try {
					// https://accounts.google.com/.well-known/openid-configuration
					const response = await fetch("https://oauth2.googleapis.com/token", {
						headers: { "Content-Type": "application/x-www-form-urlencoded" },
						body: new URLSearchParams({
							client_id: process.env.GOOGLE_CLIENT_ID || '',
							client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
							grant_type: "refresh_token",
							refresh_token: token.refresh_token,
						}),
						method: "POST",
					})
					const tokens: TokenSet = await response.json()

					if (!response.ok) {
						console.error("!response.ok", tokens, response.status, response.statusText)
						throw tokens
					}

					token.access_token = tokens.access_token
					token.expires_at = Math.floor(Date.now() / 1000 + (tokens.expires_in as any))
					token.refresh_token = tokens.refresh_token ?? token.refresh_token
					token.scope = tokens.scope
					return token
				}
				catch (error) {
					return { ...token, error: "RefreshAccessTokenError" as const }
				}
			}
		},
		async session({ session, token }: { session: any, token: any }): Promise<Session> {
			let has_gmail_scope: boolean | undefined = undefined;
			let has_gmail_readonly: boolean | undefined = undefined;
			let has_gmail_metadata: boolean | undefined = undefined;

			if (typeof token.scope === 'string') {
				const scopes = token.scope.split(' ');
				has_gmail_readonly = scopes.includes('https://www.googleapis.com/auth/gmail.readonly');
				has_gmail_metadata = scopes.includes('https://www.googleapis.com/auth/gmail.metadata');
				// Consider either scope as valid for backward compatibility
				has_gmail_scope = has_gmail_readonly || has_gmail_metadata;
			}

			let sessionResponse = {
				error: token.error,
				expires: session.expires,
				user: session.user,
				has_gmail_scope,
				has_gmail_readonly,
				has_gmail_metadata,
			}
			return sessionResponse
		},
		async redirect(){
			return "/upload_gmail"
;		}
	}
}

