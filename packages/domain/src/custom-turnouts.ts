import { TURNOUT_CATALOG, type TurnoutType } from './turnout-catalog';
import type { TurnoutPortName } from './types';

/**
 * Egne (brukerdefinerte) veksler og felles kjøretidsform for katalog- og egne typer.
 *
 * Geometri (lokalt, SS i origo, stamsporet langs +X):
 * - stamspor: rett linje med lengde `stemLengthM` (valgfritt – symmetriske veksler har det ikke);
 * - hver gren: sirkelbue med radius R fra SS (tangent til stamsporet) dreid α = atan(1/n) mot
 *   venstre/høyre, deretter et rett parti `straightM` langs buens sluttangent.
 * Alt er brukerdefinert og merkes «ikke verifisert» – med mindre typen kommer fra TRV-katalogen.
 */

export interface TurnoutBranch {
  hand: 'left' | 'right';
  /** n i krysningsforholdet 1:n (tan α = 1/n). */
  ratioN: number;
  radiusM: number;
  /** Rett parti etter buen, meter (0 = ingen). */
  straightM: number;
}

/** Hovedmål slik de oppgis i TRV-tabellene (mm); alle valgfrie. */
export interface TurnoutDimensionsMm {
  A?: number;
  B?: number;
  C?: number;
  D?: number;
  L?: number;
  E?: number;
  F?: number;
}

export interface CustomTurnoutType {
  /** `egen-001` … – unik i prosjektet. */
  id: string;
  name: string;
  /** Lengde på stamsporet (meter), eller null når det ikke er et gjennomgående stamspor. */
  stemLengthM: number | null;
  /** 1–2 grener. */
  branches: TurnoutBranch[];
  /** Hvordan typen ble definert: geometri direkte, eller utledet fra hovedmål (A–F). */
  inputMode: 'geometry' | 'dimensions';
  mainDimensionsMm?: TurnoutDimensionsMm;
  /** Fritekst: kilde, tegningsnummer, leverandør. */
  source?: string;
  note?: string;
}

export interface TurnoutDefinition {
  id: string;
  name: string;
  origin: 'catalog' | 'custom';
  verification: 'partial' | 'user_defined';
  verificationLabel: string;
  verificationNote: string;
  sourceText: string;
  stemLengthM: number | null;
  branches: TurnoutBranch[];
  mainDimensionsMm?: TurnoutDimensionsMm;
}

export const CUSTOM_VERIFICATION_LABEL = 'Brukerdefinert – ikke verifisert';
const CUSTOM_NOTE =
  'Brukerdefinert geometri (akser). Ikke et verifisert produkt og ikke for godkjent prosjektering.';

export function definitionFromCatalog(t: TurnoutType): TurnoutDefinition {
  const m = t.mainDimensionsMm;
  return {
    id: t.catalogId,
    name: t.name,
    origin: 'catalog',
    verification: 'partial',
    verificationLabel: 'Delvis verifisert',
    verificationNote: t.verificationNote,
    sourceText: t.source.drawing,
    stemLengthM: m.L / 1000,
    branches: [
      { hand: 'left', ratioN: t.ratioN, radiusM: t.radiusM, straightM: (m.D ?? 0) / 1000 },
    ],
    mainDimensionsMm: {
      A: m.A,
      B: m.B,
      C: m.C,
      D: m.D ?? undefined,
      L: m.L,
      E: m.E ?? undefined,
      F: m.F ?? undefined,
    },
  };
}

export function definitionFromCustom(c: CustomTurnoutType): TurnoutDefinition {
  return {
    id: c.id,
    name: c.name,
    origin: 'custom',
    verification: 'user_defined',
    verificationLabel: CUSTOM_VERIFICATION_LABEL,
    verificationNote: CUSTOM_NOTE,
    sourceText: c.source?.trim() || 'brukerdefinert',
    stemLengthM: c.stemLengthM,
    branches: c.branches,
    mainDimensionsMm: c.mainDimensionsMm,
  };
}

// ---------- Register over egne typer (settes av appen fra prosjektet) ----------

let registry: readonly CustomTurnoutType[] = [];

/** Appen kaller denne når prosjektets egne typer endres, så alle oppslag ser dem. */
export function setCustomTurnoutTypes(list: readonly CustomTurnoutType[]) {
  registry = list;
}
export const getCustomTurnoutTypes = (): readonly CustomTurnoutType[] => registry;

/** Slår opp en type (katalog først, deretter egne). `custom` overstyrer registeret (f.eks. ved validering). */
export function findTurnoutDefinition(
  id: string,
  custom: readonly CustomTurnoutType[] = registry,
): TurnoutDefinition | undefined {
  const cat = TURNOUT_CATALOG.find((t) => t.catalogId === id);
  if (cat) return memo(cat, () => definitionFromCatalog(cat));
  const own = custom.find((c) => c.id === id);
  return own ? memo(own, () => definitionFromCustom(own)) : undefined;
}

/** Stabil identitet per kilde, slik at hurtigbuffere kan sammenligne definisjoner med ===. */
const definitionMemo = new WeakMap<object, TurnoutDefinition>();
function memo(key: object, make: () => TurnoutDefinition): TurnoutDefinition {
  let d = definitionMemo.get(key);
  if (!d) definitionMemo.set(key, (d = make()));
  return d;
}

/** Porter vekselen har: stamspor inn, evt. stamspor ut, og én per gren. */
export function turnoutPortsFor(def: TurnoutDefinition): TurnoutPortName[] {
  const ports: TurnoutPortName[] = ['stem_in'];
  if (def.stemLengthM !== null) ports.push('stem_out');
  def.branches.forEach((_b, i) => ports.push(i === 0 ? 'diverging_out' : 'diverging2_out'));
  return ports;
}

/** Beskrivelse av vekseltypen ut fra oppbygningen. */
export function turnoutKindLabel(def: TurnoutDefinition): string {
  const b = def.branches;
  if (b.length === 1) return def.stemLengthM === null ? 'Kurve (én gren)' : 'Enkel veksel';
  const same =
    b[0]!.ratioN === b[1]!.ratioN &&
    b[0]!.radiusM === b[1]!.radiusM &&
    b[0]!.straightM === b[1]!.straightM;
  const opposite = b[0]!.hand !== b[1]!.hand;
  if (def.stemLengthM === null)
    return opposite && same ? 'Symmetrisk veksel' : 'Asymmetrisk dobbeltveksel';
  return opposite && same ? 'Tresporsveksel (symmetrisk)' : 'Tresporsveksel';
}

/** Tangentlengde T = R·tan(α/2) for en gren (meter). */
export const branchTangentM = (b: Pick<TurnoutBranch, 'ratioN' | 'radiusM'>) =>
  b.radiusM * Math.tan(Math.atan(1 / b.ratioN) / 2);

// ---------- Utledning fra TRV-lignende hovedmål ----------

export interface DimensionsInput {
  ratioN: number;
  A?: number;
  B?: number;
  C?: number;
  D?: number;
  L?: number;
}

export interface DerivedFromDimensions {
  radiusM?: number;
  stemLengthM?: number;
  straightM: number;
  /** Avvik mellom oppgitte mål (samme kontroller som er gjort på TRV-tabellene). */
  warnings: string[];
}

/**
 * Utleder geometri fra hovedmål (mm): R fra `A = R·tan(α/2)`, rett parti fra D og stamsporlengde fra L.
 * Kontrollerer at målene henger sammen: A ≈ C, B = C + D og L ≈ A + B (toleranse 2 mm).
 */
export function deriveFromDimensions(input: DimensionsInput): DerivedFromDimensions {
  const { ratioN, A, B, C, D, L } = input;
  const warnings: string[] = [];
  const tanHalf = Math.tan(Math.atan(1 / ratioN) / 2);
  const tangent = A ?? C;
  const out: DerivedFromDimensions = { straightM: (D ?? 0) / 1000, warnings };
  if (tangent !== undefined && tangent > 0) out.radiusM = tangent / 1000 / tanHalf;
  if (L !== undefined) out.stemLengthM = L / 1000;
  const tol = 2;
  if (A !== undefined && C !== undefined && Math.abs(A - C) > tol) {
    warnings.push(`A (${A}) og C (${C}) skal være like (tangentlengder til samme sirkel).`);
  }
  if (B !== undefined && C !== undefined && Math.abs(B - (C + (D ?? 0))) > tol) {
    warnings.push(`B (${B}) skal være C + D = ${C + (D ?? 0)}.`);
  }
  if (L !== undefined && A !== undefined && B !== undefined && Math.abs(L - (A + B)) > tol) {
    warnings.push(`L (${L}) avviker fra A + B = ${A + B}.`);
  }
  return out;
}

// ---------- Validering ----------

export const CUSTOM_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;

export function validateCustomTurnout(c: CustomTurnoutType): string[] {
  const errors: string[] = [];
  const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (!CUSTOM_ID_PATTERN.test(c.id))
    errors.push('ID kan bare inneholde bokstaver, tall, punktum, understrek og bindestrek.');
  if (!c.name.trim()) errors.push('Navn kan ikke være tomt.');
  if (c.name.length > 80) errors.push('Navn kan ha høyst 80 tegn.');
  if (
    c.stemLengthM !== null &&
    !(num(c.stemLengthM) && c.stemLengthM > 0 && c.stemLengthM <= 1e4)
  ) {
    errors.push('Stamsporlengde må være mellom 0 og 10 000 m (eller utelatt).');
  }
  if (c.branches.length < 1 || c.branches.length > 2)
    errors.push('En veksel må ha 1 eller 2 grener.');
  if (c.stemLengthM === null && c.branches.length < 2) {
    errors.push('Uten stamspor må vekselen ha to grener (ellers er det bare en kurve).');
  }
  c.branches.forEach((b, i) => {
    const n = `Gren ${i + 1}`;
    if (b.hand !== 'left' && b.hand !== 'right') errors.push(`${n}: velg venstre eller høyre.`);
    if (!(num(b.ratioN) && b.ratioN >= 1.5 && b.ratioN <= 100))
      errors.push(`${n}: forholdet 1:n må ha n mellom 1,5 og 100.`);
    if (!(num(b.radiusM) && b.radiusM > 0 && b.radiusM <= 1e5))
      errors.push(`${n}: radius må være mellom 0 og 100 000 m.`);
    if (!(num(b.straightM) && b.straightM >= 0 && b.straightM <= 1e3))
      errors.push(`${n}: rett parti må være mellom 0 og 1000 m.`);
  });
  if (c.branches.length === 2) {
    const [a, b] = c.branches as [TurnoutBranch, TurnoutBranch];
    if (
      a.hand === b.hand &&
      a.ratioN === b.ratioN &&
      a.radiusM === b.radiusM &&
      a.straightM === b.straightM
    ) {
      errors.push(
        'De to grenene er identiske (samme retning og mål) og ville ligge oppå hverandre.',
      );
    }
  }
  return errors;
}

// ---------- Forhåndsinnstillinger for sporkryss/kryssveksel ----------

export interface CrossingPreset {
  id: string;
  name: string;
  ratioN: number;
  halfLengthM: number;
  slip?: { arcs: 'ab' | 'ba' | 'both'; radiusM: number };
  note?: string;
}
