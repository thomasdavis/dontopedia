"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Queue" },
  { href: "/firehose", label: "Firehose" },
  { href: "/pulse", label: "Pulse" },
  { href: "/predicates", label: "Predicates" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav style={{ display: "flex", gap: 16, padding: "12px 20px", borderBottom: "1px solid #21262d", background: "#0d1117" }}>
      <span style={{ fontWeight: 700, color: "#f0f6fc", fontSize: 14, marginRight: 8 }}>donto</span>
      {links.map(l => (
        <a
          key={l.href}
          href={l.href}
          style={{
            color: path === l.href ? "#58a6ff" : "#8b949e",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: path === l.href ? 600 : 400,
            borderBottom: path === l.href ? "2px solid #58a6ff" : "2px solid transparent",
            paddingBottom: 4,
          }}
        >
          {l.label}
        </a>
      ))}
      <span style={{ flex: 1 }} />
      <a href="/explore/ex:captain-james-cook" style={{ color: "#8b949e", textDecoration: "none", fontSize: 12 }}>
        Explore entity &rarr;
      </a>
    </nav>
  );
}
