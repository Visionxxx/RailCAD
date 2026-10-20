import type { Connection, PortName, TrackGeometry } from '@railcad/domain';
import {
  TOLERANCES, type ConnectionResult, type PortPair, type PortRef,
} from '@railcad/geometry-api';
import { endPose, startPose } from './track';
import { dist, normalizeAngle } from './vec';

export function portPose(g: TrackGeometry, port: PortName) {
  if (port === 'end') return endPose(g);
  const s = startPose(g);
  return { point: s.point, headingRad: s.headingRad + Math.PI };
}

/**
 * Kontrollerer koblinger. To koblede endepunkter skal sammenfalle (posisjon) og ha motsatt
 * rettede utgående retninger (tangentkontinuitet). Avvik rapporteres – aldri rettes.
 */
export function evaluateConnections(
  tracks: ReadonlyMap<string, TrackGeometry>,
  connections: readonly Connection[],
): ConnectionResult[] {
  return connections.map((connection, index) => {
    const ga = tracks.get(connection.a.objectId);
    const gb = tracks.get(connection.b.objectId);
    if (!ga || !gb) {
      return { index, connection, status: 'missing', distanceM: NaN, tangentDeviationRad: NaN, at: null };
    }
    const a = portPose(ga, connection.a.port);
    const b = portPose(gb, connection.b.port);
    const distanceM = dist(a.point, b.point);
    const tangentDeviationRad = Math.abs(normalizeAngle(a.headingRad - b.headingRad - Math.PI));
    const status =
      distanceM > TOLERANCES.connectionPositionM
        ? 'position'
        : tangentDeviationRad > TOLERANCES.connectionTangentRad
          ? 'tangent'
          : 'ok';
    return {
      index, connection, status, distanceM, tangentDeviationRad,
      at: [(a.point[0] + b.point[0]) / 2, (a.point[1] + b.point[1]) / 2],
    };
  });
}

/** Finner par av ukoblede endepunkter på ulike spor som sammenfaller innenfor posisjonstoleransen. */
export function findCoincidentFreePorts(
  tracks: ReadonlyMap<string, TrackGeometry>,
  connections: readonly Connection[],
): PortPair[] {
  const used = new Set<string>();
  for (const c of connections) {
    used.add(`${c.a.objectId}:${c.a.port}`);
    used.add(`${c.b.objectId}:${c.b.port}`);
  }
  const tol = TOLERANCES.connectionPositionM;
  const cell = Math.max(tol * 4, 1e-6);
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const grid = new Map<string, Array<PortRef & { p: readonly [number, number] }>>();
  const pairs: PortPair[] = [];

  for (const [id, g] of tracks) {
    for (const port of ['start', 'end'] as const) {
      if (used.has(`${id}:${port}`)) continue;
      const p = portPose(g, port).point;
      const cx = Math.floor(p[0] / cell);
      const cy = Math.floor(p[1] / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const other of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
            const d = dist(p, other.p);
            if (other.objectId !== id && d <= tol) {
              pairs.push({ a: { objectId: other.objectId, port: other.port }, b: { objectId: id, port }, distanceM: d });
            }
          }
        }
      }
      const k = key(p[0], p[1]);
      const list = grid.get(k);
      if (list) list.push({ objectId: id, port, p });
      else grid.set(k, [{ objectId: id, port, p }]);
    }
  }
  return pairs;
}
