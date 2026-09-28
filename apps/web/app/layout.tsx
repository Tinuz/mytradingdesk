import type { Metadata } from "next";
import { viewMode } from "../lib/view-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crypto Macro Intelligence",
  description: "Explainable macro and crypto regime intelligence",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" data-view-mode={await viewMode()}>
      <body>{children}</body>
    </html>
  );
}
