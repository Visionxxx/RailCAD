import { z } from 'zod';
import {
  validateCustomTurnout,
  type CrossingPreset,
  type CustomTurnoutType,
} from './custom-turnouts';
import { TURNOUT_CATALOG } from './turnout-catalog';
import { crossingPresetSchema, customTurnoutSchema } from './validation';

/**
 * Bibliotekfil: egne veksltyper og krysningsforhåndsinnstillinger som kan deles mellom prosjekter
 * og personer. Innholdet er brukerdefinert og blir aldri «verifisert» av å bli delt.
 */
export const LIBRARY_FORMAT = 'railcad-bibliotek';

export interface LibraryFile {
  format: typeof LIBRARY_FORMAT;
  version: 1;
  turnouts: CustomTurnoutType[];
  crossingPresets: CrossingPreset[];
}

const libraryFileSchema = z
  .object({
    format: z.literal(LIBRARY_FORMAT),
    version: z.literal(1),
    turnouts: z.array(customTurnoutSchema).max(500),
    crossingPresets: z.array(crossingPresetSchema).max(500),
  })
  .passthrough();

export function serializeLibrary(
  turnouts: readonly CustomTurnoutType[],
  crossingPresets: readonly CrossingPreset[],
): string {
  const file: LibraryFile = {
    format: LIBRARY_FORMAT,
    version: 1,
    turnouts: [...turnouts],
    crossingPresets: [...crossingPresets],
  };
  return JSON.stringify(file, null, 2) + '\n';
}

export type LibraryParseResult =
  { ok: true; library: LibraryFile } | { ok: false; errors: string[] };

/** Parser og validerer en bibliotekfil. Kaster aldri – feil returneres som liste. */
export function parseLibrary(text: string): LibraryParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Filen er ikke gyldig JSON (${(e as Error).message}).`] };
  }
  if (typeof raw === 'object' && raw !== null && 'schemaVersion' in raw) {
    return {
      ok: false,
      errors: ['Dette er en prosjektfil, ikke en bibliotekfil. Bruk Fil → Åpne for prosjekter.'],
    };
  }
  const parsed = libraryFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
      ),
    };
  }
  const library = parsed.data as unknown as LibraryFile;
  const errors: string[] = [];
  const seen = new Set<string>();
  library.turnouts.forEach((c, i) => {
    if (seen.has(c.id)) errors.push(`turnouts[${i}]: duplikat ID «${c.id}»`);
    seen.add(c.id);
    for (const m of validateCustomTurnout(c)) errors.push(`turnouts[${i}] (${c.id}): ${m}`);
  });
  const presets = new Set<string>();
  library.crossingPresets.forEach((c, i) => {
    if (presets.has(c.id)) errors.push(`crossingPresets[${i}]: duplikat ID «${c.id}»`);
    presets.add(c.id);
    if (c.slip && c.slip.radiusM * Math.tan(Math.atan(1 / c.ratioN) / 2) > c.halfLengthM)
      errors.push(
        `crossingPresets[${i}] (${c.id}): tangentlengden overstiger lengden fra M til enden`,
      );
  });
  return errors.length ? { ok: false, errors } : { ok: true, library };
}

/** JSON med sorterte nøkler, slik at rekkefølgen i filen ikke påvirker sammenligningen. */
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p.localeCompare(q)))
      : x,
  );
const sameContent = (a: object, b: object, ignore: string) =>
  canonical({ ...a, [ignore]: 0 }) === canonical({ ...b, [ignore]: 0 });

function freeId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export interface LibraryMerge {
  turnouts: CustomTurnoutType[];
  crossingPresets: CrossingPreset[];
  /** Antall nye oppføringer, identiske som hoppes over, og omdøpte pga. ID-konflikt. */
  added: number;
  skipped: number;
  renamed: Array<{ from: string; to: string }>;
}

/**
 * Slår en importert bibliotekfil sammen med prosjektets egne oppføringer. Identiske oppføringer
 * (samme ID og innhold) hoppes over; samme ID med annet innhold får ny ID – eksisterende
 * oppføringer (og objekter som bruker dem) endres aldri.
 */
export function mergeLibrary(
  existingTurnouts: readonly CustomTurnoutType[],
  existingPresets: readonly CrossingPreset[],
  incoming: LibraryFile,
): LibraryMerge {
  const turnouts = [...existingTurnouts];
  const presets = [...existingPresets];
  const takenT = new Set([
    ...turnouts.map((t) => t.id),
    ...TURNOUT_CATALOG.map((t) => t.catalogId),
  ]);
  const takenP = new Set(presets.map((p) => p.id));
  const out: LibraryMerge = {
    turnouts,
    crossingPresets: presets,
    added: 0,
    skipped: 0,
    renamed: [],
  };
  for (const t of incoming.turnouts) {
    const same = turnouts.find((x) => x.id === t.id);
    if (same && sameContent(same, t, 'id')) {
      out.skipped++;
      continue;
    }
    const id = freeId(t.id, takenT);
    if (id !== t.id) out.renamed.push({ from: t.id, to: id });
    takenT.add(id);
    turnouts.push({ ...t, id });
    out.added++;
  }
  for (const p of incoming.crossingPresets) {
    const same = presets.find((x) => x.id === p.id);
    if (same && sameContent(same, p, 'id')) {
      out.skipped++;
      continue;
    }
    const id = freeId(p.id, takenP);
    if (id !== p.id) out.renamed.push({ from: p.id, to: id });
    takenP.add(id);
    presets.push({ ...p, id });
    out.added++;
  }
  return out;
}
