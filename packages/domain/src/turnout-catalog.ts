/**
 * Versjonert sporvekselbibliotek.
 *
 * Kilde: Bane NOR, Teknisk regelverk, Overbygning/Prosjektering/Sporveksler («Hovedmål»).
 * Alle mål i mm. Se docs/vekseldata-trv.md for kontroll og forbehold.
 *
 * VERIFISERINGSSTATUS: `partial` = hovedmålene er hentet fra TRV og kontrollert innbyrdes
 * (B = C + D, L ≈ A + B, A = R·tan(α/2)), men geometrien er AVLEDET av dem. Tungespiss, skjøter
 * og avviksbuens eksakte sluttpunkt mot bakkant er ikke lest fra KO-tegningene (ProArc).
 * Slike veksler skal ikke regnes som verifisert prosjekteringsgeometri.
 */

export type TurnoutVerification = 'partial';

export interface TurnoutType {
  catalogId: string;
  name: string;
  profile: '54E3' | '60E1';
  /** n i stigning 1:n. tan(krysningsvinkel) = 1/n. */
  ratioN: number;
  /** Avviksbuens radius R, meter. */
  radiusM: number;
  crossing: 'EVF' | 'EVB' | 'kort kurve';
  /** Hovedmål i mm slik de står i TRV. `null` = ikke oppgitt (–). */
  mainDimensionsMm: {
    A: number;
    B: number;
    C: number;
    D: number | null;
    L: number;
    E: number | null;
    F: number | null;
  };
  source: {
    document: string;
    url: string;
    revision: string;
    drawing: string;
  };
  verification: TurnoutVerification;
  verificationNote: string;
}

export const TURNOUT_CATALOG_REVISION = 'TRV 2026-05-18 (oldid 141902), bibliotek 0.1';

const SOURCE_DOC = 'Bane NOR TRV – Overbygning/Prosjektering/Sporveksler, Hovedmål';
const SOURCE_URL = 'https://trv.banenor.no/wiki/Overbygning/Prosjektering/Sporveksler';
const NOTE =
  'Delvis verifisert: akser avledet fra TRV-hovedmål. Ikke kontrollert mot KO-tegning. Ikke for godkjent prosjektering.';

export const TURNOUT_CATALOG: readonly TurnoutType[] = [
  {
    catalogId: 'trv-54E3-1:9-R190-kort',
    name: '54E3 1:9 R190 (kort kurve)',
    profile: '54E3',
    ratioN: 9,
    radiusM: 190,
    crossing: 'kort kurve',
    mainDimensionsMm: { A: 10523, B: 16616, C: 10523, D: 6093, L: 27139, E: 3000, F: 3575 },
    source: {
      document: SOURCE_DOC,
      url: SOURCE_URL,
      revision: TURNOUT_CATALOG_REVISION,
      drawing: 'KO-701334',
    },
    verification: 'partial',
    verificationNote: NOTE,
  },
  {
    catalogId: 'trv-60E1-1:9-R300-EVF',
    name: '60E1 1:9 R300 (fast kryss)',
    profile: '60E1',
    ratioN: 9,
    radiusM: 300,
    crossing: 'EVF',
    mainDimensionsMm: { A: 16615, B: 16615, C: 16615, D: null, L: 33230, E: 5400, F: 2350 },
    source: {
      document: SOURCE_DOC,
      url: SOURCE_URL,
      revision: TURNOUT_CATALOG_REVISION,
      drawing: 'KO-701409',
    },
    verification: 'partial',
    verificationNote: NOTE,
  },
  {
    catalogId: 'trv-60E1-1:12-R500-EVF',
    name: '60E1 1:12 R500 (fast kryss)',
    profile: '60E1',
    ratioN: 12,
    radiusM: 500,
    crossing: 'EVF',
    mainDimensionsMm: { A: 20797, B: 21985, C: 20797, D: 1188, L: 42783, E: 7314, F: 3600 },
    source: {
      document: SOURCE_DOC,
      url: SOURCE_URL,
      revision: TURNOUT_CATALOG_REVISION,
      drawing: 'KO-800068',
    },
    verification: 'partial',
    verificationNote: NOTE,
  },
];

export function getTurnoutType(catalogId: string): TurnoutType | undefined {
  return TURNOUT_CATALOG.find((t) => t.catalogId === catalogId);
}
