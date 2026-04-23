import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Financial Intelligence",
  description:
    "Source-backed investment memos, company analysis, and evidence-led diligence across market, filing, and registry data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en" className="h-full antialiased">
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
