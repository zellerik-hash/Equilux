/**
 * EQUILUX — europäisches Handelsuniversum für den Stat-Arb-Scan.
 *
 * Kuratierte Liste liquider Titel, keine offizielle Indexzusammensetzung.
 * Bewusst kompakt gehalten und nach Sektor gruppiert: cointegrierte Paare
 * sitzen fast immer innerhalb einer Branche, und ein Scan innerhalb der
 * Gruppen findet dieselben Kandidaten bei einem Bruchteil der Rechenzeit.
 *
 * Zur Größenordnung: die 165 Titel ergeben rund 13.500 Paare. Auf dem
 * 5-%-Niveau kommen davon etwa 675 durch reinen Zufall durch — mehr, als ein
 * echter Kandidatenkreis je umfasst. Gruppenweise zu scannen ist deshalb
 * nicht nur schneller, sondern statistisch sauberer: die größte Gruppe hat
 * gut 200 Paare, und dort ist die Zufallsquote beherrschbar.
 *
 * Die Liste ist bewusst kürzer als die 438 Titel der Python-Pipeline. Sie
 * deckt dieselben Börsenplätze ab, verzichtet aber auf die dünn gehandelten
 * Ränder, bei denen der Kursabruf ohnehin oft Lücken liefert.
 */

export const GROUPS: Record<string, string[]> = {
  "DAX Industrie": ["SIE.DE", "BAS.DE", "BAYN.DE", "LIN.DE", "AIR.DE", "MBG.DE", "BMW.DE", "VOW3.DE", "P911.DE", "CON.DE", "HEI.DE", "RHM.DE", "MTX.DE", "ENR.DE"],
  "DAX Finanzen": ["ALV.DE", "MUV2.DE", "DBK.DE", "CBK.DE", "HNR1.DE", "DB1.DE"],
  "DAX Technologie": ["SAP.DE", "IFX.DE", "SRT3.DE", "QIA.DE"],
  "DAX Konsum": ["ADS.DE", "PUM.DE", "BEI.DE", "HEN3.DE", "ZAL.DE", "DHL.DE"],
  "DAX Versorger": ["RWE.DE", "EOAN.DE"],
  "MDAX Auswahl": ["EVK.DE", "LHA.DE", "FRA.DE", "TKA.DE", "SDF.DE", "NDA.DE", "G1A.DE", "AFX.DE", "KGX.DE", "JUN3.DE", "FNTN.DE", "TLX.DE"],
  "CAC 40": ["MC.PA", "OR.PA", "TTE.PA", "SAN.PA", "AIR.PA", "BNP.PA", "SU.PA", "AI.PA", "CS.PA", "DG.PA", "SGO.PA", "EL.PA", "KER.PA", "RMS.PA", "ACA.PA", "GLE.PA", "STLAP.PA", "VIE.PA", "ENGI.PA", "ORA.PA"],
  "AEX": ["ASML.AS", "INGA.AS", "PHIA.AS", "HEIA.AS", "AD.AS", "DSFIR.AS", "AKZA.AS", "WKL.AS", "RAND.AS", "NN.AS", "ASRNL.AS", "KPN.AS"],
  "SMI": ["NESN.SW", "ROG.SW", "NOVN.SW", "UBSG.SW", "ZURN.SW", "ABBN.SW", "CFR.SW", "SIKA.SW", "GIVN.SW", "SLHN.SW", "GEBN.SW", "HOLN.SW", "LONN.SW", "SCMN.SW"],
  "IBEX": ["SAN.MC", "BBVA.MC", "ITX.MC", "IBE.MC", "REP.MC", "AENA.MC", "FER.MC", "TEF.MC", "CABK.MC", "AMS.MC", "ELE.MC", "ACS.MC"],
  "FTSE MIB": ["ENI.MI", "ISP.MI", "UCG.MI", "ENEL.MI", "G.MI", "STLAM.MI", "RACE.MI", "TIT.MI", "PST.MI", "MB.MI", "SRG.MI", "TRN.MI"],
  "FTSE 100": ["SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L", "GSK.L", "RIO.L", "GLEN.L", "DGE.L", "BATS.L", "LSEG.L", "REL.L", "NG.L", "BARC.L", "LLOY.L", "PRU.L", "AAL.L", "TSCO.L", "VOD.L", "SSE.L"],
  "Nordics": ["NOVO-B.CO", "MAERSK-B.CO", "DSV.CO", "NOVN.CO", "ERIC-B.ST", "VOLV-B.ST", "ATCO-A.ST", "SAND.ST", "INVE-B.ST", "SEB-A.ST", "HM-B.ST", "ASSA-B.ST", "EQNR.OL", "DNB.OL", "NHY.OL", "TEL.OL", "NESTE.HE", "NOKIA.HE", "FORTUM.HE", "UPM.HE"],
  "Energie & Netze": ["PRY.MI", "NEX.PA", "SU.PA", "ENR.DE", "VWS.CO", "ORSTED.CO", "SGRE.MC", "FVG.DE"],
  "Halbleiter Europa": ["ASML.AS", "ASM.AS", "BESI.AS", "IFX.DE", "STMPA.PA", "AIXA.DE", "SOI.PA"],
};

/** Alle Titel ohne Dopplungen. */
export const ALL: string[] = Array.from(new Set(Object.values(GROUPS).flat()));

export const GROUP_NAMES = Object.keys(GROUPS);

/** Titel einer Gruppe, oder das ganze Universum bei "ALLE". */
export function universe(name: string): string[] {
  if (name === "ALLE") return ALL;
  return GROUPS[name] ?? [];
}
