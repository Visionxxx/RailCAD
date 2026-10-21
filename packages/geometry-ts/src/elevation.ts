import type {
  Connection,
  CrossingPlacement,
  TrackGeometry,
  TurnoutType,
  Vec2,
} from '@railcad/domain';
import { portKey } from '@railcad/geometry-api';
import { closestPoint, length } from './track';

/**
 * Høydemodell: kote (høyde) settes ved porter. Tilkoblede porter er samme punkt og deler kote.
 * Langs et spor/en akse er høyden lineær mellom endeportenes koter (konstant stigning).
 */

/** Gruppering av porter via koblinger (union-find). Nøkkel = `<objektId>:<port>`. */
export function portClusters(connections: readonly Connection[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) as string;
    parent.set(k, r);
    return r;
  };
  for (const c of connections) {
    const a = find(portKey(c.a.objectId, c.a.port));
    const b = find(portKey(c.b.objectId, c.b.port));
    if (a !== b) parent.set(a, b);
  }
  const out = new Map<string, string>();
  for (const k of parent.keys()) out.set(k, find(k));
  return out;
}

export interface ElevationConflict {
  /** Portene i gruppen som har ulik kote. */
  ports: string[];
  values: number[];
}

/**
 * Effektiv kote per port: for tilkoblede porter brukes gruppens kote. Har portene i en gruppe ulike
 * koter (> `tolM`), er det en konflikt som rapporteres – den første kjente verdien brukes videre.
 */
export function resolveElevations(
  portElevations: Readonly<Record<string, number>>,
  connections: readonly Connection[],
  tolM = 1e-6,
): { effective: Map<string, number>; conflicts: ElevationConflict[] } {
  const cluster = portClusters(connections);
  const groups = new Map<string, string[]>();
  for (const [k, root] of cluster) {
    const list = groups.get(root);
    if (list) list.push(k);
    else groups.set(root, [k]);
  }
  const effective = new Map<string, number>();
  const conflicts: ElevationConflict[] = [];
  for (const members of groups.values()) {
    const known = members.filter((k) => portElevations[k] !== undefined).sort();
    if (!known.length) continue;
    const first = portElevations[known[0] as string] as number;
    const differing = known.filter((k) => Math.abs((portElevations[k] as number) - first) > tolM);
    if (differing.length) {
      conflicts.push({ ports: known, values: known.map((k) => portElevations[k] as number) });
    }
    for (const k of members) effective.set(k, first);
  }
  for (const [k, z] of Object.entries(portElevations)) if (!effective.has(k)) effective.set(k, z);
  return { effective, conflicts };
}

/** Lineær kote langs en akse med kjente endekoter; null hvis en av dem er ukjent. */
export function lerpElevation(
  zStart: number | undefined,
  zEnd: number | undefined,
  s: number,
  total: number,
): number | null {
  if (zStart === undefined || zEnd === undefined || total <= 0) return null;
  return zStart + ((zEnd - zStart) * Math.min(Math.max(s, 0), total)) / total;
}

/** Stigning i promille (positiv = stigende fra start mot slutt). */
export function gradePermille(
  zStart: number | undefined,
  zEnd: number | undefined,
  lengthM: number,
): number | null {
  if (zStart === undefined || zEnd === undefined || lengthM <= 0) return null;
  return ((zEnd - zStart) / lengthM) * 1000;
}

export interface SegmentElevation {
  zStart: number | null;
  zEnd: number | null;
}

/** Kote ved start/slutt av hvert av vekselens segmenter (stamspor, avviksbue, evt. rett parti). */
export function turnoutSegmentElevations(
  type: TurnoutType,
  segments: readonly TrackGeometry[],
  z: { stemIn?: number; stemOut?: number; divergingOut?: number },
): SegmentElevation[] {
  const out: SegmentElevation[] = [];
  const divergingTotal = segments.slice(1).reduce((a, g) => a + length(g), 0);
  segments.forEach((g, i) => {
    if (i === 0) {
      out.push({ zStart: z.stemIn ?? null, zEnd: z.stemOut ?? null });
      return;
    }
    const before = segments.slice(1, i).reduce((a, h) => a + length(h), 0);
    const along = (s: number) => lerpElevation(z.stemIn, z.divergingOut, s, divergingTotal);
    out.push({ zStart: along(before), zEnd: along(before + length(g)) });
  });
  void type;
  return out;
}

/** Kote ved start/slutt av sporkryssets to akser (kryssvekselbuer får ingen kote). */
export function crossingSegmentElevations(
  _placement: CrossingPlacement,
  segments: readonly TrackGeometry[],
  z: { aStart?: number; aEnd?: number; bStart?: number; bEnd?: number },
): SegmentElevation[] {
  return segments.map((_g, i) =>
    i === 0
      ? { zStart: z.aStart ?? null, zEnd: z.aEnd ?? null }
      : i === 1
        ? { zStart: z.bStart ?? null, zEnd: z.bEnd ?? null }
        : { zStart: null, zEnd: null },
  );
}

/** Kote i et punkt nær en akse (projisert på nærmeste segment). Null hvis ukjent. */
export function elevationNear(
  segments: readonly TrackGeometry[],
  elevations: readonly SegmentElevation[],
  point: Vec2,
): number | null {
  let best = Infinity;
  let result: number | null = null;
  segments.forEach((g, i) => {
    const c = closestPoint(g, point);
    if (c.distanceM < best) {
      best = c.distanceM;
      const e = elevations[i];
      result = e ? lerpElevation(e.zStart ?? undefined, e.zEnd ?? undefined, c.s, length(g)) : null;
    }
  });
  return result;
}
