import Link from "next/link";
import type { ReactNode } from "react";
import css from "./topbar.module.css";

export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className={css.bar}>
      <Link href="/" className={css.brand}>
        <span className={css.dot} aria-hidden />
        <span className={css.word}>Dontopedia</span>
      </Link>
      <div className={css.search}>{children}</div>
      <nav className={css.nav}>
        <Link href="/recent" className={css.navItem}>
          recent
        </Link>
        <Link href="/predicates" className={css.navItem}>
          predicates
        </Link>
      </nav>
    </header>
  );
}
