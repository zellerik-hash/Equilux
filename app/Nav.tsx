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
      <Link href="/" className={s.brand}>
        {/* Das Zeichen liegt als Datei vor und bleibt so mit dem App-Icon identisch. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className={s.mark} width={26} height={26} />
        EQUILUX
      </Link>
      <div className={s.right}>
        <ModeToggle />
        <Link href="/impressum" className={s.linkQuiet}>Impressum</Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}
