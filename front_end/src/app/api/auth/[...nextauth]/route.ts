import NextAuth from "next-auth";
import GitHubProvider from "next-auth/providers/github";

const handler = NextAuth({
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      // Expose the GitHub username in the session
      if (token.profile) {
        (session as any).githubUsername = (token.profile as any).login;
      }
      return session;
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.profile = profile;
      }
      return token;
    },
  },
});

export { handler as GET, handler as POST };
