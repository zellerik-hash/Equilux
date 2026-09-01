"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./Nav.module.css";
import ThemeToggle from "./ThemeToggle";
import ModeToggle from "./ModeToggle";

export default function Nav() {
  const pathname = usePathname();
  // Auf /labor übernimmt die App-Shell die Navigation.
  if (pathname.startsWith("/labor")) return null;

  return (
    <nav className={s.nav}>
      <Link href="/" className={s.brand}>EQUILUX</Link>
      <div className={s.right}>
        <ModeToggle />
        <Link href="/labor" className={s.link}>Terminal öffnen</Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
