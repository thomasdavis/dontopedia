import Link from "next/link";
import type { ReactNode } from "react";
import { currentUser } from "@/server/auth";
import { UserMenu } from "./UserMenu";
import css from "./topbar.module.css";

export async function TopBar({ children }: { children?: ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <header className={css.bar}>
      <Link href="/" className={css.brand}>
        <span className={css.dot} aria-hidden />
        <span className={css.word}>Dontopedia</span>
      </Link>
      <div className={css.search}>{children}</div>
      <div className={css.right}>
        {user ? (
          <UserMenu email={user.email} iri={user.iri} />
        ) : (
          <Link href="/login" className={css.signin}>
            sign in
          </Link>
        )}
      </div>
    </header>
  );
}
