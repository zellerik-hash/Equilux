"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./Nav.module.css";
import ThemeToggle from "./ThemeToggle";

export default function Nav() {
  const pathname = usePathname();
  // Auf /labor übernimmt die App-Shell die Navigation.
  if (pathname.startsWith("/labor")) return null;

  return (
    <nav className={s.nav}>
      <Link href="/" className={s.brand}>EQUILUX</Link>
      <div className={s.right}>
        <Link href="/labor" className={s.link}>Terminal</Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
