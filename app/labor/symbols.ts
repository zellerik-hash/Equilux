/**
 * EQUILUX — Stammdaten zu Tickern: Anzeigename und Logo-Domain.
 * Bewusst klein und kuratiert (bekannte EU/US-Titel). Unbekannte Ticker zeigen
 * den Ticker als Namen und ein Monogramm statt Logo. Domain speist die
 * Logo-API (Clearbit); ohne Netz greift der Monogramm-Fallback.
 */
export interface SymbolMeta {
  name: string;
  domain?: string;
}

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
  AMZN: { name: "Amazon", domain: "amazon.com" },
  GOOGL: { name: "Alphabet", domain: "abc.xyz" },
  META: { name: "Meta Platforms", domain: "meta.com" },
  TSLA: { name: "Tesla", domain: "tesla.com" },
};

export function metaFor(symbol: string): SymbolMeta {
  return SYMBOLS[symbol.trim().toUpperCase()] ?? { name: symbol.trim().toUpperCase() };
}
