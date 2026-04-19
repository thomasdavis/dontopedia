import type { Metadata, Viewport } from "next";
import "@dontopedia/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dontopedia",
  description:
    "An open wiki where every claim has a source, a time, and an opinion. Contradictions are on purpose.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://dontopedia.com",
  ),
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffbf5" },
    { media: "(prefers-color-scheme: dark)", color: "#17120c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
