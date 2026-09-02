/**
 * EQUILUX — Stammdaten zu Tickern: Anzeigename, Logo-Domain und Marktkategorie.
 * `SYMBOLS` sind die logo-reichen, bekannten Titel; `CATALOG` ist die breitere,
 * durchsuchbare Liste (Aktien, Indizes, Krypto, Rohstoffe, Forex, Futures).
 * Unbekannte Ticker zeigen den Ticker als Namen und ein Monogramm statt Logo.
 */
export interface SymbolMeta {
  name: string;
  domain?: string;
}

export type Market = "aktien" | "indizes" | "krypto" | "rohstoffe" | "forex" | "futures";

export const MARKETS: { key: Market; label: string; color: string }[] = [
  { key: "aktien", label: "Aktien", color: "var(--accent)" },
  { key: "indizes", label: "Indizes", color: "var(--accent-2)" },
  { key: "krypto", label: "Krypto", color: "var(--up)" },
  { key: "rohstoffe", label: "Rohstoffe", color: "var(--gold)" },
  { key: "forex", label: "Forex", color: "var(--london)" },
  { key: "futures", label: "Futures", color: "var(--newyork)" },
];

export const SYMBOLS: Record<string, SymbolMeta> = {
  "SAP.DE": { name: "SAP SE", domain: "sap.com" },
  "SIE.DE": { name: "Siemens AG", domain: "siemens.com" },
  "ALV.DE": { name: "Allianz SE", domain: "allianz.com" },
  "MUV2.DE": { name: "Münchener Rück", domain: "munichre.com" },
  "BMW.DE": { name: "BMW AG", domain: "bmw.com" },
  "MBG.DE": { name: "Mercedes-Benz", domain: "mercedes-benz.com" },
  "VOW3.DE": { name: "Volkswagen", domain: "volkswagen.com" },
  "BAS.DE": { name: "BASF SE", domain: "basf.com" },
  "BAYN.DE": { name: "Bayer AG", domain: "bayer.com" },
  "DTE.DE": { name: "Deutsche Telekom", domain: "telekom.com" },
  "RWE.DE": { name: "RWE AG", domain: "rwe.com" },
  "EOAN.DE": { name: "E.ON SE", domain: "eon.com" },
  "ADS.DE": { name: "adidas AG", domain: "adidas.com" },
  "RHM.DE": { name: "Rheinmetall AG", domain: "rheinmetall.com" },
  "IFX.DE": { name: "Infineon", domain: "infineon.com" },
  "AIR.PA": { name: "Airbus SE", domain: "airbus.com" },
  "MC.PA": { name: "LVMH", domain: "lvmh.com" },
  "OR.PA": { name: "L'Oréal", domain: "loreal.com" },
  "ASML.AS": { name: "ASML Holding", domain: "asml.com" },
  "SHEL.L": { name: "Shell plc", domain: "shell.com" },
  "BP.L": { name: "BP plc", domain: "bp.com" },
  "HSBA.L": { name: "HSBC Holdings", domain: "hsbc.com" },
  "NESN.SW": { name: "Nestlé SA", domain: "nestle.com" },
  "NOVN.SW": { name: "Novartis AG", domain: "novartis.com" },
  "ISP.MI": { name: "Intesa Sanpaolo", domain: "intesasanpaolo.com" },
  "UCG.MI": { name: "UniCredit", domain: "unicredit.eu" },
  "SAN.MC": { name: "Banco Santander", domain: "santander.com" },
  "BBVA.MC": { name: "BBVA", domain: "bbva.com" },
  AAPL: { name: "Apple Inc.", domain: "apple.com" },
  MSFT: { name: "Microsoft", domain: "microsoft.com" },
  NVDA: { name: "NVIDIA", domain: "nvidia.com" },
  AMD: { name: "AMD", domain: "amd.com" },
  AMZN: { name: "Amazon", domain: "amazon.com" },
  GOOGL: { name: "Alphabet", domain: "abc.xyz" },
  META: { name: "Meta Platforms", domain: "meta.com" },
  TSLA: { name: "Tesla", domain: "tesla.com" },
};

export interface CatalogEntry { symbol: string; name: string; market: Market; }

/** Durchsuchbarer Marktkatalog. Freie Ticker bleiben zusätzlich möglich. */
export const CATALOG: CatalogEntry[] = [
  // Aktien
  ...Object.entries(SYMBOLS).map(([symbol, m]) => ({ symbol, name: m.name, market: "aktien" as Market })),
  // Indizes
  { symbol: "^GDAXI", name: "DAX 40", market: "indizes" },
  { symbol: "^GSPC", name: "S&P 500", market: "indizes" },
  { symbol: "^IXIC", name: "Nasdaq Composite", market: "indizes" },
  { symbol: "^DJI", name: "Dow Jones", market: "indizes" },
  { symbol: "^FTSE", name: "FTSE 100", market: "indizes" },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50", market: "indizes" },
  { symbol: "^N225", name: "Nikkei 225", market: "indizes" },
  { symbol: "^VIX", name: "VIX (Volatilität)", market: "indizes" },
  // Krypto
  { symbol: "BTC-USD", name: "Bitcoin", market: "krypto" },
  { symbol: "ETH-USD", name: "Ethereum", market: "krypto" },
  { symbol: "SOL-USD", name: "Solana", market: "krypto" },
  { symbol: "XRP-USD", name: "XRP", market: "krypto" },
  { symbol: "ADA-USD", name: "Cardano", market: "krypto" },
  { symbol: "DOGE-USD", name: "Dogecoin", market: "krypto" },
  // Rohstoffe
  { symbol: "GC=F", name: "Gold", market: "rohstoffe" },
  { symbol: "SI=F", name: "Silber", market: "rohstoffe" },
  { symbol: "CL=F", name: "Rohöl WTI", market: "rohstoffe" },
  { symbol: "BZ=F", name: "Rohöl Brent", market: "rohstoffe" },
  { symbol: "NG=F", name: "Erdgas", market: "rohstoffe" },
  { symbol: "HG=F", name: "Kupfer", market: "rohstoffe" },
  // Forex
  { symbol: "EURUSD=X", name: "Euro / US-Dollar", market: "forex" },
  { symbol: "GBPUSD=X", name: "Pfund / US-Dollar", market: "forex" },
  { symbol: "USDJPY=X", name: "US-Dollar / Yen", market: "forex" },
  { symbol: "EURGBP=X", name: "Euro / Pfund", market: "forex" },
  { symbol: "USDCHF=X", name: "US-Dollar / Franken", market: "forex" },
  // Futures
  { symbol: "ES=F", name: "S&P 500 Future (E-mini)", market: "futures" },
  { symbol: "NQ=F", name: "Nasdaq-100 Future (E-mini)", market: "futures" },
  { symbol: "YM=F", name: "Dow Future (E-mini)", market: "futures" },
  { symbol: "RTY=F", name: "Russell 2000 Future", market: "futures" },
];

const CATALOG_BY_SYMBOL: Record<string, CatalogEntry> = Object.fromEntries(
  CATALOG.map((e) => [e.symbol, e]),
);

/* ---------- Handelsplätze (Mehrfachnotierungen derselben Firma) ---------- */

export interface Listing { venue: string; symbol: string; }

/**
 * Dieselbe Firma an verschiedenen Handelsplätzen — praktisch, um denselben
 * Titel wahlweise an der Heimatbörse oder als US-Notierung (ADR) zu sehen,
 * etwa wenn die Daten dort vollständiger sind.
 */
const VENUE_GROUPS: Listing[][] = [
  [{ venue: "Xetra", symbol: "SAP.DE" }, { venue: "NYSE (ADR)", symbol: "SAP" }],
  [{ venue: "Xetra", symbol: "SIE.DE" }, { venue: "OTC (ADR)", symbol: "SIEGY" }],
  [{ venue: "Xetra", symbol: "ALV.DE" }, { venue: "OTC (ADR)", symbol: "ALIZY" }],
  [{ venue: "Xetra", symbol: "MUV2.DE" }, { venue: "OTC (ADR)", symbol: "MURGY" }],
  [{ venue: "Xetra", symbol: "BMW.DE" }, { venue: "OTC (ADR)", symbol: "BMWYY" }],
  [{ venue: "Xetra", symbol: "MBG.DE" }, { venue: "OTC (ADR)", symbol: "MBGYY" }],
  [{ venue: "Xetra", symbol: "VOW3.DE" }, { venue: "OTC (ADR)", symbol: "VWAGY" }],
  [{ venue: "Xetra", symbol: "BAS.DE" }, { venue: "OTC (ADR)", symbol: "BASFY" }],
  [{ venue: "Xetra", symbol: "BAYN.DE" }, { venue: "OTC (ADR)", symbol: "BAYRY" }],
  [{ venue: "Xetra", symbol: "DTE.DE" }, { venue: "OTC (ADR)", symbol: "DTEGY" }],
  [{ venue: "Xetra", symbol: "RWE.DE" }, { venue: "OTC (ADR)", symbol: "RWEOY" }],
  [{ venue: "Xetra", symbol: "EOAN.DE" }, { venue: "OTC (ADR)", symbol: "EONGY" }],
  [{ venue: "Xetra", symbol: "ADS.DE" }, { venue: "OTC (ADR)", symbol: "ADDYY" }],
  [{ venue: "Xetra", symbol: "RHM.DE" }, { venue: "OTC (ADR)", symbol: "RNMBY" }],
  [{ venue: "Xetra", symbol: "IFX.DE" }, { venue: "OTC (ADR)", symbol: "IFNNY" }],
  [{ venue: "Euronext Paris", symbol: "AIR.PA" }, { venue: "OTC (ADR)", symbol: "EADSY" }],
  [{ venue: "Euronext Paris", symbol: "MC.PA" }, { venue: "OTC (ADR)", symbol: "LVMUY" }],
  [{ venue: "Euronext Paris", symbol: "OR.PA" }, { venue: "OTC (ADR)", symbol: "LRLCY" }],
  [{ venue: "Euronext Amsterdam", symbol: "ASML.AS" }, { venue: "Nasdaq", symbol: "ASML" }],
  [{ venue: "London", symbol: "SHEL.L" }, { venue: "NYSE (ADR)", symbol: "SHEL" }],
  [{ venue: "London", symbol: "BP.L" }, { venue: "NYSE (ADR)", symbol: "BP" }],
  [{ venue: "London", symbol: "HSBA.L" }, { venue: "NYSE (ADR)", symbol: "HSBC" }],
  [{ venue: "SIX Zürich", symbol: "NESN.SW" }, { venue: "OTC (ADR)", symbol: "NSRGY" }],
  [{ venue: "SIX Zürich", symbol: "NOVN.SW" }, { venue: "NYSE (ADR)", symbol: "NVS" }],
  [{ venue: "Borsa Italiana", symbol: "ISP.MI" }, { venue: "OTC (ADR)", symbol: "ISNPY" }],
  [{ venue: "Borsa Italiana", symbol: "UCG.MI" }, { venue: "OTC (ADR)", symbol: "UNCRY" }],
  [{ venue: "BME Madrid", symbol: "SAN.MC" }, { venue: "NYSE (ADR)", symbol: "SAN" }],
  [{ venue: "BME Madrid", symbol: "BBVA.MC" }, { venue: "NYSE (ADR)", symbol: "BBVA" }],
];

const VENUE_INDEX: Record<string, Listing[]> = {};
for (const g of VENUE_GROUPS) for (const l of g) VENUE_INDEX[l.symbol] = g;

/** Alternative Handelsplätze zu einem Ticker; leer, wenn es nur einen gibt. */
export function venuesFor(symbol: string): Listing[] {
  return VENUE_INDEX[symbol.trim().toUpperCase()] ?? [];
}

export function metaFor(symbol: string): SymbolMeta {
  const sym = symbol.trim().toUpperCase();
  if (SYMBOLS[sym]) return SYMBOLS[sym];
  const c = CATALOG_BY_SYMBOL[sym];
  if (c) return { name: c.name };
  // Zweitnotierung (ADR): Name und Logo von der Hauptnotierung übernehmen.
  for (const l of venuesFor(sym)) {
    if (SYMBOLS[l.symbol]) return SYMBOLS[l.symbol];
    const alt = CATALOG_BY_SYMBOL[l.symbol];
    if (alt) return { name: alt.name };
  }
  return { name: sym };
}

/** Marktkategorie eines Tickers — Katalog zuerst, sonst Heuristik. */
export function marketOf(symbol: string): Market {
  const sym = symbol.trim().toUpperCase();
  if (CATALOG_BY_SYMBOL[sym]) return CATALOG_BY_SYMBOL[sym].market;
  if (sym.startsWith("^")) return "indizes";
  if (sym.endsWith("=X")) return "forex";
  if (sym.endsWith("=F")) return "futures";
  if (/-(USD|EUR|USDT)$/.test(sym)) return "krypto";
  return "aktien";
}

/** Katalogsuche nach Ticker/Name, optional auf einen Markt eingeschränkt. */
export function searchCatalog(query: string, market?: Market | null): CatalogEntry[] {
  const q = query.trim().toUpperCase();
  return CATALOG.filter((e) => {
    if (market && e.market !== market) return false;
    if (!q) return true;
    return e.symbol.toUpperCase().includes(q) || e.name.toUpperCase().includes(q);
  });
}
