"use client";

import { ReactLenis } from "lenis/react";
import { useEffect, useState } from "react";

/**
 * Sanftes Momentum-Scrolling (Lenis), global. Dezent gedämpft — kein
 * übertriebenes „Nachschwingen". Respektiert prefers-reduced-motion: bei
 * reduzierter Bewegung wird Lenis gar nicht erst aktiviert, dann scrollt der
 * Browser wie gewohnt.
 */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setEnabled(!m.matches);
    apply();
    m.addEventListener?.("change", apply);
    return () => m.removeEventListener?.("change", apply);
  }, []);

  if (!enabled) return <>{children}</>;

  return (
    <ReactLenis root options={{ lerp: 0.12, duration: 0.9, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}
