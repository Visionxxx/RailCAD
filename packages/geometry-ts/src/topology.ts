import type { Connection } from '@railcad/domain';
import {
  TOLERANCES,
  portKey,
  type ConnectionResult,
  type PortPair,
  type PortRef,
  type Pose,
} from '@railcad/geometry-api';
import { dist, normalizeAngle } from './vec';

/**
 * Kontrollerer koblinger mot et kart over alle porter (`<objektId>:<port>` → posisjon og UTGÅENDE
 * retning). To koblede porter skal sammenfalle og ha motsatt rettede utgående retninger
 * (tangentkontinuitet). Avvik rapporteres – aldri rettes.
 */
export function evaluateConnections(
  ports: ReadonlyMap<string, Pose>,
  connections: readonly Connection[],
): ConnectionResult[] {
  return connections.map((connection, index) => {
    const a = ports.get(portKey(connection.a.objectId, connection.a.port));
    const b = ports.get(portKey(connection.b.objectId, connection.b.port));
    if (!a || !b) {
      return {
        index,
        connection,
        status: 'missing',
        distanceM: NaN,
        tangentDeviationRad: NaN,
        at: null,
      };
    }
    const distanceM = dist(a.point, b.point);
    const tangentDeviationRad = Math.abs(normalizeAngle(a.headingRad - b.headingRad - Math.PI));
    const status =
      distanceM > TOLERANCES.connectionPositionM
        ? 'position'
        : tangentDeviationRad > TOLERANCES.connectionTangentRad
          ? 'tangent'
          : 'ok';
    return {
      index,
      connection,
      status,
      distanceM,
      tangentDeviationRad,
      at: [(a.point[0] + b.point[0]) / 2, (a.point[1] + b.point[1]) / 2],
    };
  });
}

/** Finner par av ukoblede porter på ulike objekter som sammenfaller innenfor posisjonstoleransen. */
export function findCoincidentFreePorts(
  ports: ReadonlyMap<string, Pose>,
  connections: readonly Connection[],
): PortPair[] {
  const used = new Set<string>();
  for (const c of connections) {
    used.add(portKey(c.a.objectId, c.a.port));
    used.add(portKey(c.b.objectId, c.b.port));
  }
  const tol = TOLERANCES.connectionPositionM;
  const cell = Math.max(tol * 4, 1e-6);
  const grid = new Map<string, Array<PortRef & { p: readonly [number, number] }>>();
  const pairs: PortPair[] = [];

  for (const [key, pose] of ports) {
    if (used.has(key)) continue;
    const split = key.lastIndexOf(':');
    const ref: PortRef = {
      objectId: key.slice(0, split),
      port: key.slice(split + 1) as PortRef['port'],
    };
    const p = pose.point;
    const cx = Math.floor(p[0] / cell);
    const cy = Math.floor(p[1] / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const d = dist(p, other.p);
          if (other.objectId !== ref.objectId && d <= tol) {
            pairs.push({ a: { objectId: other.objectId, port: other.port }, b: ref, distanceM: d });
          }
        }
      }
    }
    const k = `${cx},${cy}`;
    const entry = { ...ref, p };
    const list = grid.get(k);
    if (list) list.push(entry);
    else grid.set(k, [entry]);
  }
  return pairs;
}
