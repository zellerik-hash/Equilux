/**
 * EQUILUX — schlanker Linien-/Flächenchart als reines SVG. Kein Chart-Framework.
 * Bekommt eine Schlusskursreihe und zeichnet Linie + Fläche mit Verlauf, dazu
 * eine Nulllinie zum ersten Kurs. Farbe nach Vorzeichen der Gesamtänderung.
 */
export default function MiniChart({
  data,
  height = 132,
}: {
  data: number[];
  height?: number;
}) {
  if (!data || data.length < 2) {
    return null;
  }
  const W = 320;
  const H = 120;
  const padY = 10;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const n = data.length;

  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - 2 * padY);

  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const baseY = y(data[0]);
  const up = data[n - 1] >= data[0];
  const stroke = up ? "var(--up)" : "var(--down)";
  const id = up ? "eqUp" : "eqDown";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      style={{ display: "block", color: stroke, overflow: "visible" }}
      role="img"
      aria-label="Kursverlauf"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Nulllinie: erster Kurs */}
      <line
        x1="0"
        x2={W}
        y1={baseY.toFixed(2)}
        y2={baseY.toFixed(2)}
        stroke="var(--border-strong)"
        strokeWidth="1"
        strokeDasharray="3 4"
        vectorEffect="non-scaling-stroke"
      />
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
