import type { MetadataRoute } from "next";

/**
 * PWA-Manifest — macht EQUILUX auf dem iPad/Handy „installierbar" (zum
 * Homescreen hinzufügen) und startet dann im Vollbild ohne Browser-Leiste.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EQUILUX — Aktien-Terminal",
    short_name: "EQUILUX",
    description: "Quantitatives Aktien-Terminal: Charts, Derivate, Bewertung, Stat-Arb, Marktbrief.",
    start_url: "/labor",
    display: "standalone",
    background_color: "#0c0e13",
    theme_color: "#0c0e13",
    orientation: "any",
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
