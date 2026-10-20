import { z } from 'zod';
import type { RailProject, TrackGeometry } from './types';

/** Gjeldende filformatversjon. Endres kun sammen med en migrering i `migrate.ts`. */
export const CURRENT_SCHEMA_VERSION = '0.1.0';

const finite = z.number().refine((n) => Number.isFinite(n), 'må være et endelig tall');
const vec2 = z.tuple([finite, finite]);
const nonEmptyString = z.string().min(1, 'kan ikke være tom');
const portSchema = z.enum(['start', 'end']);
const endpointRef = z.object({ objectId: nonEmptyString, port: portSchema }).passthrough();

const geometrySchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('line'), start: vec2, headingRad: finite, lengthM: finite })
    .passthrough(),
  z
    .object({
      kind: z.literal('arc'),
      start: vec2,
      headingRad: finite,
      signedRadiusM: finite,
      sweepRad: finite,
    })
    .passthrough(),
]);

const dimensionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('length'), targetId: nonEmptyString, offsetM: finite }).passthrough(),
  z.object({ kind: z.literal('distance'), a: vec2, b: vec2, offsetM: finite }).passthrough(),
]);

const objectSchema = z.discriminatedUnion('type', [
  z
    .object({ id: nonEmptyString, type: z.literal('track_segment'), geometry: geometrySchema })
    .passthrough(),
  z
    .object({ id: nonEmptyString, type: z.literal('dimension'), dimension: dimensionSchema })
    .passthrough(),
]);

const projectSchema = z
  .object({
    schemaVersion: nonEmptyString,
    project: z
      .object({
        id: nonEmptyString,
        name: z.string(),
        description: z.string().optional(),
        units: z.literal('m'),
        coordinateSystem: z.object({ type: z.literal('local_xy') }).passthrough(),
      })
      .passthrough(),
    objects: z.array(objectSchema),
    connections: z.array(z.object({ a: endpointRef, b: endpointRef }).passthrough()),
  })
  .passthrough();

/** Geometriske invarianter (spesifikasjon 5.5). Returnerer feilmeldinger, tom liste = gyldig. */
export function validateGeometry(g: TrackGeometry): string[] {
  const errors: string[] = [];
  if (!g.start.every(Number.isFinite)) errors.push('Startpunkt må være endelige tall.');
  if (!Number.isFinite(g.headingRad)) errors.push('Retning må være et endelig tall.');
  if (g.kind === 'line') {
    if (!(Number.isFinite(g.lengthM) && g.lengthM > 0)) {
      errors.push('Lengde må være et positivt, endelig tall.');
    }
  } else {
    if (!Number.isFinite(g.signedRadiusM) || g.signedRadiusM === 0) {
      errors.push('Radius kan ikke være null og må være et endelig tall.');
    }
    if (!(Number.isFinite(g.sweepRad) && g.sweepRad > 0 && g.sweepRad < 2 * Math.PI)) {
      errors.push('Sweep-vinkel må være større enn 0 og mindre enn 360°.');
    }
  }
  return errors;
}

export type ProjectValidation =
  | { ok: true; project: RailProject }
  | { ok: false; errors: string[] };

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>(
    (acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)),
    '',
  );
}

/**
 * Validerer ukjent data (f.eks. importert JSON) mot prosjektskjemaet:
 * struktur, tallverdier, geometriske invarianter, unike ID-er og referanser.
 * Ukjente felt bevares uendret; manglende eller ugyldige felt gir en feil – aldri stille retting.
 */
export function validateProject(raw: unknown): ProjectValidation {
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => {
        const path = formatPath(i.path);
        return path ? `${path}: ${i.message}` : i.message;
      }),
    };
  }
  const project = parsed.data as unknown as RailProject;
  const errors: string[] = [];

  const ids = new Map<string, string>();
  project.objects.forEach((o, i) => {
    if (ids.has(o.id)) errors.push(`objects[${i}].id: duplikat ID «${o.id}»`);
    ids.set(o.id, o.type);
    if (o.type === 'track_segment') {
      for (const msg of validateGeometry(o.geometry)) errors.push(`objects[${i}] (${o.id}): ${msg}`);
    }
  });
  project.objects.forEach((o, i) => {
    if (o.type !== 'dimension') return;
    const d = o.dimension;
    if (d.kind === 'length' && ids.get(d.targetId) !== 'track_segment') {
      errors.push(`objects[${i}] (${o.id}): målet viser til ukjent sporobjekt «${d.targetId}»`);
    }
    if (d.kind === 'distance' && d.a[0] === d.b[0] && d.a[1] === d.b[1]) {
      errors.push(`objects[${i}] (${o.id}): punktene i målet er sammenfallende`);
    }
  });
  project.connections.forEach((c, i) => {
    for (const end of [c.a, c.b]) {
      if (ids.get(end.objectId) !== 'track_segment') {
        errors.push(`connections[${i}]: viser til ukjent sporobjekt «${end.objectId}»`);
      }
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, project };
}
