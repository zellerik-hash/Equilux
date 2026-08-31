/**
 * EQUILUX — geteilte Typen der Rechenkerne.
 * Ein Import-Punkt für Routen, Bibliothek und Komponenten.
 */
export type { BsInput, Greeks, OptionType, Direction, WarrantInput, WarrantResult,
  TurboInput, TurboResult, ScenarioCell } from "@/lib/quant/bs";
export type { CointResult, StabilityResult, PairReport, PairOptions,
  BacktestResult, Regime } from "@/lib/quant/statarb";
export type { Segment, SotpBasis, SotpInput, SotpResult, SegmentResult,
  SotpSensitivityCell } from "@/lib/quant/sotp";
export type { Brief, BriefOptions, SessionKey, SessionSpec, Quote,
  CalendarItem, EarningsItem, SourceItem } from "@/lib/quant/brief";
export type { EdgarResult, CustomerMention } from "@/lib/quant/edgar";

/** Einheitliche Hülle aller Quant-Routen. */
export type QuantResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
