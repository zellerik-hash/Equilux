import { Suspense } from "react";
import Labor from "./Labor";

export const metadata = {
  title: "Rechenlabor — EQUILUX",
  description: "Derivate, Bewertung, Stat-Arb, Sum-of-the-Parts, Filings und Marktbrief.",
};

export default function LaborPage() {
  return (
    <Suspense fallback={null}>
      <Labor />
    </Suspense>
  );
}
