import { z } from 'zod';
import { BACKGROUND_LIMITS, type DxfPrim } from './background';
import { getTurnoutType } from './turnout-catalog';
import {
  CROSSING_PORTS,
  DEFAULT_LAYER_ID,
  TRACK_PORTS,
  TURNOUT_PORTS,
  type RailProject,
  type TrackGeometry,
} from './types';

/** Gjeldende filformatversjon. Endres kun sammen med en migrering i `migrate.ts`. */
export const CURRENT_SCHEMA_VERSION = '0.1.0';

const finite = z.number().refine((n) => Number.isFinite(n), 'må være et endelig tall');
/** Grenser som holder all geometri innenfor trygt tallområde (overflow gir NaN i visning og eksport). */
export const GEOMETRY_LIMITS = Object.freeze({
  /** Største absolutte koordinat, meter (UTM-nordverdier er < 1,1e7). */
  maxCoordinateM: 1e8,
  /** Største lengde / radius, meter. */
  maxExtentM: 1e7,
});
const coordinate = finite.refine(
  (n) => Math.abs(n) <= GEOMETRY_LIMITS.maxCoordinateM,
  `koordinat utenfor ±${GEOMETRY_LIMITS.maxCoordinateM} m`,
);
const vec2 = z.tuple([coordinate, coordinate]);
const nonEmptyString = z.string().min(1, 'kan ikke være tom');
/** ID-er brukes i menyvalg og snap-referanser (`id:port`, `id#n`) – derfor et trygt tegnsett. */
const idString = z
  .string()
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    'ID kan bare inneholde bokstaver (a–z), tall, punktum, understrek og bindestrek',
  );
const portSchema = z.enum([
  'start',
  'end',
  'stem_in',
  'stem_out',
  'diverging_out',
  'a_start',
  'a_end',
  'b_start',
  'b_end',
]);
const endpointRef = z.object({ objectId: idString, port: portSchema }).passthrough();

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

const objectCommon = {
  locked: z.boolean().optional(),
  layerId: idString.optional(),
};
const objectSchema = z.discriminatedUnion('type', [
  z
    .object({
      id: idString,
      type: z.literal('track_segment'),
      geometry: geometrySchema,
      ...objectCommon,
    })
    .passthrough(),
  z
    .object({
      id: idString,
      ...objectCommon,
      type: z.literal('turnout'),
      turnout: z
        .object({
          catalogId: nonEmptyString,
          catalogRevision: z.string(),
          position: vec2,
          headingRad: finite,
          hand: z.enum(['left', 'right']),
        })
        .passthrough(),
    })
    .passthrough(),
  z
    .object({
      id: idString,
      ...objectCommon,
      type: z.literal('crossing'),
      crossing: z
        .object({
          position: vec2,
          headingRad: finite,
          ratioN: finite.refine(
            (n) => n >= 1.5 && n <= 100,
            'krysningsforholdet 1:n må ha n mellom 1,5 og 100',
          ),
          halfLengthM: finite.refine(
            (n) => n > 0 && n <= 1e4,
            'lengden fra M til enden må være mellom 0 og 10 000 m',
          ),
          slip: z
            .object({
              arcs: z.enum(['ab', 'ba', 'both']),
              radiusM: finite.refine(
                (n) => n > 0 && n <= 1e5,
                'radius må være mellom 0 og 100 000 m',
              ),
            })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    })
    .passthrough(),
  z
    .object({
      id: idString,
      type: z.literal('dimension'),
      dimension: dimensionSchema,
      ...objectCommon,
    })
    .passthrough(),
]);

const placementSchema = z
  .object({
    origin: vec2,
    scaleMPerUnit: finite.refine((n) => n > 0, 'skala må være større enn 0'),
    rotationRad: finite,
    scaleConfirmed: z.boolean(),
  })
  .passthrough();
const backgroundCommon = {
  id: idString,
  name: z.string(),
  visible: z.boolean(),
  opacity: finite.refine((n) => n >= 0 && n <= 1, 'dekkevne må være mellom 0 og 1'),
  placement: placementSchema,
};
const backgroundSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('dxf'),
      ...backgroundCommon,
      layers: z.array(
        z.object({ name: z.string(), color: z.number().int().min(0).max(256) }).passthrough(),
      ),
      prims: z.array(z.any()),
      sourceUnits: z.string(),
      extents: z.object({ minX: finite, minY: finite, maxX: finite, maxY: finite }).passthrough(),
    })
    .passthrough(),
  z
    .object({
      kind: z.literal('image'),
      ...backgroundCommon,
      source: z.enum(['image', 'pdf']),
      dataUrl: z
        .string()
        .regex(/^data:image\/(png|jpeg);base64,/, 'må være en PNG- eller JPEG-data-URL')
        .refine((s) => s.length <= BACKGROUND_LIMITS.maxImageDataUrlChars, 'bildet er for stort'),
      widthPx: z.number().int().positive().max(BACKGROUND_LIMITS.maxImagePixelsPerSide),
      heightPx: z.number().int().positive().max(BACKGROUND_LIMITS.maxImagePixelsPerSide),
    })
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
    backgrounds: z.array(backgroundSchema).optional(),
    layers: z
      .array(
        z
          .object({
            id: idString,
            name: z.string().min(1).max(60),
            visible: z.boolean(),
            locked: z.boolean(),
          })
          .passthrough(),
      )
      .optional(),
    acknowledgedCrossings: z
      .array(z.string().regex(/^[A-Za-z0-9_.-]+\|[A-Za-z0-9_.-]+$/, 'forventet «idA|idB»'))
      .optional(),
  })
  .passthrough();

/** Geometriske invarianter (spesifikasjon 5.5). Returnerer feilmeldinger, tom liste = gyldig. */
export function validateGeometry(g: TrackGeometry): string[] {
  const errors: string[] = [];
  const { maxCoordinateM, maxExtentM } = GEOMETRY_LIMITS;
  if (!g.start.every((n) => Number.isFinite(n) && Math.abs(n) <= maxCoordinateM)) {
    errors.push(`Startpunkt må være endelige tall innenfor ±${maxCoordinateM} m.`);
  }
  if (!Number.isFinite(g.headingRad)) errors.push('Retning må være et endelig tall.');
  if (g.kind === 'line') {
    if (!(Number.isFinite(g.lengthM) && g.lengthM > 0 && g.lengthM <= maxExtentM)) {
      errors.push(`Lengde må være et positivt tall på høyst ${maxExtentM} m.`);
    }
  } else {
    if (
      !Number.isFinite(g.signedRadiusM) ||
      g.signedRadiusM === 0 ||
      Math.abs(g.signedRadiusM) > maxExtentM
    ) {
      errors.push(`Radius kan ikke være null og må være innenfor ±${maxExtentM} m.`);
    }
    if (!(Number.isFinite(g.sweepRad) && g.sweepRad > 0 && g.sweepRad < 2 * Math.PI)) {
      errors.push('Sweep-vinkel må være større enn 0 og mindre enn 360°.');
    } else if (Math.abs(g.signedRadiusM) * g.sweepRad > maxExtentM) {
      errors.push(`Buelengden kan ikke overstige ${maxExtentM} m.`);
    }
  }
  return errors;
}

/** Kontrollerer kompakte DXF-primitiver. Returnerer første feil, eller null. */
export function validatePrims(prims: readonly unknown[], layerCount: number): string | null {
  if (prims.length > BACKGROUND_LIMITS.maxPrims) return `for mange primitiver (${prims.length})`;
  const finiteNums = (a: readonly unknown[]) =>
    a.every((n) => typeof n === 'number' && Number.isFinite(n));
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i] as DxfPrim | undefined;
    if (!Array.isArray(p)) return `prims[${i}]: forventet liste`;
    const layer = p[1];
    if (
      !Number.isInteger(layer) ||
      (layer as number) < 0 ||
      (layer as number) >= Math.max(layerCount, 1)
    ) {
      return `prims[${i}]: ugyldig lag-indeks`;
    }
    switch (p[0]) {
      case 'L':
        if (p.length !== 6 || !finiteNums(p.slice(2))) return `prims[${i}]: ugyldig linje`;
        break;
      case 'A':
        if (p.length !== 7 || !finiteNums(p.slice(2)) || (p[4] as number) <= 0)
          return `prims[${i}]: ugyldig bue`;
        break;
      case 'C':
        if (p.length !== 5 || !finiteNums(p.slice(2)) || (p[4] as number) <= 0)
          return `prims[${i}]: ugyldig sirkel`;
        break;
      case 'P':
        if (
          p.length !== 4 ||
          (p[2] !== 0 && p[2] !== 1) ||
          !Array.isArray(p[3]) ||
          p[3].length % 3 !== 0 ||
          p[3].length < 6 ||
          !finiteNums(p[3])
        ) {
          return `prims[${i}]: ugyldig polylinje`;
        }
        break;
      case 'T':
        if (p.length !== 7 || !finiteNums(p.slice(2, 6)) || typeof p[6] !== 'string')
          return `prims[${i}]: ugyldig tekst`;
        break;
      default:
        return `prims[${i}]: ukjent primitiv «${String(p[0])}»`;
    }
  }
  return null;
}

export type ProjectValidation =
  { ok: true; project: RailProject } | { ok: false; errors: string[] };

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
      for (const msg of validateGeometry(o.geometry))
        errors.push(`objects[${i}] (${o.id}): ${msg}`);
    }
    if (o.type === 'crossing' && o.crossing.slip) {
      const alpha = Math.atan(1 / o.crossing.ratioN);
      const tangent = o.crossing.slip.radiusM * Math.tan(alpha / 2);
      if (tangent > o.crossing.halfLengthM) {
        errors.push(
          `objects[${i}] (${o.id}): kryssvekselens tangentlengde R·tan(α/2) = ${tangent.toFixed(3)} m overstiger lengden fra M til enden (${o.crossing.halfLengthM} m)`,
        );
      }
    }
    if (o.type === 'turnout' && !getTurnoutType(o.turnout.catalogId)) {
      errors.push(
        `objects[${i}] (${o.id}): ukjent sporvekseltype «${o.turnout.catalogId}» (finnes ikke i biblioteket)`,
      );
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
  const layerIds = new Set<string>([DEFAULT_LAYER_ID]);
  (project.layers ?? []).forEach((l, i) => {
    if (l.id !== DEFAULT_LAYER_ID && layerIds.has(l.id)) {
      errors.push(`layers[${i}].id: duplikat ID «${l.id}»`);
    }
    layerIds.add(l.id);
  });
  project.objects.forEach((o, i) => {
    if (o.layerId && !layerIds.has(o.layerId)) {
      errors.push(`objects[${i}] (${o.id}): viser til ukjent lag «${o.layerId}»`);
    }
  });
  const bgIds = new Set<string>();
  (project.backgrounds ?? []).forEach((b, i) => {
    if (bgIds.has(b.id)) errors.push(`backgrounds[${i}].id: duplikat ID «${b.id}»`);
    bgIds.add(b.id);
    if (b.kind === 'dxf') {
      const e = validatePrims(b.prims, b.layers.length);
      if (e) errors.push(`backgrounds[${i}] (${b.id}): ${e}`);
    }
  });
  const usedPorts = new Set<string>();
  project.connections.forEach((c, i) => {
    for (const end of [c.a, c.b]) {
      const kind = ids.get(end.objectId);
      if (kind !== 'track_segment' && kind !== 'turnout' && kind !== 'crossing') {
        errors.push(`connections[${i}]: viser til ukjent sporobjekt «${end.objectId}»`);
      } else {
        const allowed: readonly string[] =
          kind === 'turnout' ? TURNOUT_PORTS : kind === 'crossing' ? CROSSING_PORTS : TRACK_PORTS;
        if (!allowed.includes(end.port)) {
          errors.push(
            `connections[${i}]: porten «${end.port}» finnes ikke på ${kind === 'turnout' ? 'sporveksel' : kind === 'crossing' ? 'sporkryss' : 'spor'} «${end.objectId}»`,
          );
        }
      }
      const key = `${end.objectId}:${end.port}`;
      if (usedPorts.has(key)) {
        errors.push(`connections[${i}]: porten «${key}» er koblet flere ganger`);
      }
      usedPorts.add(key);
    }
    if (c.a.objectId === c.b.objectId && c.a.port === c.b.port) {
      errors.push(`connections[${i}]: en port kan ikke kobles til seg selv`);
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, project };
}
