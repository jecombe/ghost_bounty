import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ShadowPool | FHE Privacy Pool",
  description: "Confidential USDC privacy pool powered by FHE encryption. Deposit and withdraw with full amount privacy.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const headersList = await headers();
  const cookie = headersList.get("cookie") ?? "";

  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <AppShell cookie={cookie}>{children}</AppShell>
      </body>
    </html>
  );
}
