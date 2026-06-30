import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Bounty Distributor",
  description: "Autonomous bounties judged by AI-validator consensus on GenLayer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
