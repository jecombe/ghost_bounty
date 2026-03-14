import GitHubProvider from "next-auth/providers/github";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: "read:user public_repo" } },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token.profile) {
        (session as any).githubUsername = (token.profile as any).login;
      }
      if (token.accessToken) {
        (session as any).accessToken = token.accessToken;
      }
      return session;
    },
    async jwt({ token, profile, account }) {
      if (profile) {
        token.profile = profile;
      }
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
  },
};
