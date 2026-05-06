import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Donto Debug — Extraction Queue",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0d1117", color: "#c9d1d9", fontFamily: "-apple-system, system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
