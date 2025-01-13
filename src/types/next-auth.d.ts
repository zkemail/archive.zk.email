import NextAuth from "next-auth"

declare module "next-auth" {
	interface Session {
		has_gmail_scope: boolean | undefined,
	}
}
