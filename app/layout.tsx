import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";
import Nav from "./Nav";
import Aurora from "./Aurora";
import SmoothScroll from "./SmoothScroll";
import { ModeProvider } from "./mode";

const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", variable: "--font-sans" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-mono" });

export const metadata: Metadata = {
  title: "EQUILUX",
  description:
    "Quantitative Aktien-Workstation — stell dir dein eigenes Terminal aus Derivaten, Bewertung, Stat-Arb, SOTP, Filings und Marktbrief zusammen.",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "EQUILUX", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#06070c",
  width: "device-width",
  initialScale: 1,
  // Randlos bis in die Ecken; die sicheren Bereiche fängt das CSS über env() ab.
  viewportFit: "cover",
};

// Wendet die gespeicherte Theme-Wahl vor dem ersten Paint an (kein Flash).
const themeScript = `(function(){try{var t=localStorage.getItem('equilux-theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${dmSans.variable} ${dmMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Aurora />
        <ModeProvider>
          <SmoothScroll>
            <Nav />
            {children}
          </SmoothScroll>
        </ModeProvider>
      </body>
    </html>
  );
}
