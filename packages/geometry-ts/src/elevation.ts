import type {
  Connection,
  CrossingPlacement,
  TrackGeometry,
  TurnoutPortName,
  Vec2,
} from '@railcad/domain';
import { portKey, type TurnoutRoute } from '@railcad/geometry-api';
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

/**
 * Kote ved start/slutt av vekselens segmenter. Hver rute (stamspor eller gren) går fra stamspor inn
 * til sin utgående port; høyden er lineær langs ruten mellom portenes koter.
 */
export function turnoutSegmentElevations(
  segments: readonly TrackGeometry[],
  routes: readonly TurnoutRoute[],
  z: Partial<Record<TurnoutPortName, number>>,
): SegmentElevation[] {
  const out: SegmentElevation[] = segments.map(() => ({ zStart: null, zEnd: null }));
  for (const r of routes) {
    const total = r.segments.reduce((a, i) => a + length(segments[i] as TrackGeometry), 0);
    let before = 0;
    for (const i of r.segments) {
      const len = length(segments[i] as TrackGeometry);
      out[i] = {
        zStart: lerpElevation(z.stem_in, z[r.port], before, total),
        zEnd: lerpElevation(z.stem_in, z[r.port], before + len, total),
      };
      before += len;
    }
  }
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
