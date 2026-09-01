"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./Nav.module.css";

const LINKS = [
  { href: "/", label: "Übersicht" },
  { href: "/labor", label: "Rechenlabor" },
];

export default function Nav() {
  const pathname = usePathname();
  // Auf /labor übernimmt die App-Shell mit Seitenleiste die Navigation.
  if (pathname.startsWith("/labor")) return null;
  return (
    <nav className={s.nav}>
      <Link href="/" className={s.brand}>EQUILUX</Link>
      <div className={s.links}>
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={`${s.link} ${active ? s.linkOn : ""}`}>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
