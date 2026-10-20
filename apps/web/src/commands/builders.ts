import {
  type Background,
  idPrefix,
  isDimension,
  isTrack,
  isTurnout,
  nextId,
  type Connection,
  type DimensionSpec,
  type PortName,
  type RailObject,
  type TrackGeometry,
  type TurnoutPlacement,
  type Vec2,
} from '@railcad/domain';
import type { GeometryEngine } from '@railcad/geometry-api';
import type { Patch } from './patch';

/** Rene funksjoner som bygger `Patch` fra gjeldende modell. Ingen tilstand, ingen Vue. */

export function createTrack(
  objects: readonly RailObject[],
  geometry: TrackGeometry,
): { patch: Patch; id: string } {
  const id = nextId(
    idPrefix('track_segment'),
    objects.map((o) => o.id),
  );
  const object: RailObject = { id, type: 'track_segment', geometry };
  return {
    id,
    patch: {
      label: geometry.kind === 'line' ? 'Tegn rett spor' : 'Tegn sirkelkurve',
      objects: { [id]: { before: null, after: object, index: objects.length } },
    },
  };
}

export function createDimension(
  objects: readonly RailObject[],
  dimension: DimensionSpec,
): { patch: Patch; id: string } {
  const id = nextId(
    idPrefix('dimension'),
    objects.map((o) => o.id),
  );
  const object: RailObject = { id, type: 'dimension', dimension };
  return {
    id,
    patch: {
      label: 'Nytt mål',
      objects: { [id]: { before: null, after: object, index: objects.length } },
    },
  };
}

/** Erstatter eksisterende objekter. Ingen patch hvis ingenting faktisk endres. */
export function replaceObjects(
  objects: readonly RailObject[],
  replacements: ReadonlyMap<string, RailObject>,
  label: string,
): Patch | null {
  const entries: Patch['objects'] = {};
  objects.forEach((o, index) => {
    const after = replacements.get(o.id);
    if (after && after !== o) entries[o.id] = { before: o, after, index };
  });
  return Object.keys(entries).length ? { label, objects: entries } : null;
}

/**
 * Sletter objekter. Lengdemål knyttet til slettede spor slettes med, og koblinger som viser
 * til slettede spor fjernes – alt i samme patch, slik at angre gjenoppretter hele settet.
 */
export function deleteObjects(
  objects: readonly RailObject[],
  connections: readonly Connection[],
  ids: Iterable<string>,
): Patch | null {
  const doomed = new Set(ids);
  for (const o of objects) {
    if (isDimension(o) && o.dimension.kind === 'length' && doomed.has(o.dimension.targetId)) {
      doomed.add(o.id);
    }
  }
  const entries: Patch['objects'] = {};
  objects.forEach((o, index) => {
    if (doomed.has(o.id)) entries[o.id] = { before: o, after: null, index };
  });
  if (!Object.keys(entries).length) return null;
  const patch: Patch = { label: 'Slett', objects: entries };
  const kept = connections.filter((c) => !doomed.has(c.a.objectId) && !doomed.has(c.b.objectId));
  if (kept.length !== connections.length) {
    patch.connections = { before: [...connections], after: kept };
  }
  return patch;
}

/** Flytter eller roterer objekter. Lengdemål følger sporet og endres ikke. */
export function transformObjects(
  objects: readonly RailObject[],
  ids: ReadonlySet<string>,
  engine: GeometryEngine,
  op: { type: 'move'; dx: number; dy: number } | { type: 'rotate'; pivot: Vec2; angleRad: number },
  label: string,
): Patch | null {
  const movePoint = (p: Vec2): Vec2 =>
    op.type === 'move'
      ? [p[0] + op.dx, p[1] + op.dy]
      : engine.rotate({ kind: 'line', start: p, headingRad: 0, lengthM: 1 }, op.pivot, op.angleRad)
          .start;
  const replacements = new Map<string, RailObject>();
  for (const o of objects) {
    if (!ids.has(o.id)) continue;
    if (isTrack(o)) {
      const geometry =
        op.type === 'move'
          ? engine.translate(o.geometry, op.dx, op.dy)
          : engine.rotate(o.geometry, op.pivot, op.angleRad);
      replacements.set(o.id, { ...o, geometry });
    } else if (isTurnout(o)) {
      replacements.set(o.id, {
        ...o,
        turnout: {
          ...o.turnout,
          position: movePoint(o.turnout.position),
          headingRad: o.turnout.headingRad + (op.type === 'rotate' ? op.angleRad : 0),
        },
      });
    } else if (o.dimension.kind === 'distance') {
      replacements.set(o.id, {
        ...o,
        dimension: { ...o.dimension, a: movePoint(o.dimension.a), b: movePoint(o.dimension.b) },
      });
    }
  }
  return replaceObjects(objects, replacements, label);
}

/** Kobler to ukoblede porter. Null hvis en av dem allerede er i bruk eller portene er like. */
export function connectPorts(
  connections: readonly Connection[],
  a: { objectId: string; port: PortName },
  b: { objectId: string; port: PortName },
): Patch | null {
  const same = a.objectId === b.objectId && a.port === b.port;
  const used = (p: { objectId: string; port: PortName }) =>
    connections.some(
      (c) =>
        (c.a.objectId === p.objectId && c.a.port === p.port) ||
        (c.b.objectId === p.objectId && c.b.port === p.port),
    );
  if (same || used(a) || used(b)) return null;
  return {
    label: 'Koble spor',
    objects: {},
    connections: { before: [...connections], after: [...connections, { a, b }] },
  };
}

export function disconnect(connections: readonly Connection[], index: number): Patch | null {
  if (index < 0 || index >= connections.length) return null;
  return {
    label: 'Fjern kobling',
    objects: {},
    connections: {
      before: [...connections],
      after: connections.filter((_, i) => i !== index),
    },
  };
}

/** Nytt spor som starter i en eksisterende port – spor og kobling i ÉN angrebar handling. */
export function createTrackConnected(
  objects: readonly RailObject[],
  connections: readonly Connection[],
  geometry: TrackGeometry,
  anchor: { objectId: string; port: PortName },
): { patch: Patch; id: string } {
  const { patch, id } = createTrack(objects, geometry);
  patch.label = geometry.kind === 'line' ? 'Nytt rett spor fra port' : 'Ny kurve fra port';
  patch.connections = {
    before: [...connections],
    after: [...connections, { a: anchor, b: { objectId: id, port: 'start' } }],
  };
  return { patch, id };
}

/**
 * Plasserer en sporveksel fra biblioteket. Med `anchor` kobles stamspor inn (SS) til en eksisterende
 * port i samme angrebare handling.
 */
export function createTurnout(
  objects: readonly RailObject[],
  connections: readonly Connection[],
  placement: TurnoutPlacement,
  anchor?: { objectId: string; port: PortName },
): { patch: Patch; id: string } {
  const id = nextId(
    'turnout',
    objects.map((o) => o.id),
  );
  const object: RailObject = { id, type: 'turnout', turnout: placement };
  const patch: Patch = {
    label: 'Plasser sporveksel',
    objects: { [id]: { before: null, after: object, index: objects.length } },
  };
  if (anchor) {
    patch.connections = {
      before: [...connections],
      after: [...connections, { a: anchor, b: { objectId: id, port: 'stem_in' } }],
    };
  }
  return { patch, id };
}

/** Ny bakgrunn legges øverst i listen (tegnes sist av bakgrunnene). */
export function addBackgroundPatch(backgrounds: readonly Background[], bg: Background): Patch {
  return {
    label: 'Importer bakgrunn',
    objects: {},
    backgrounds: { before: [...backgrounds], after: [...backgrounds, bg] },
  };
}

export function updateBackgroundPatch(
  backgrounds: readonly Background[],
  id: string,
  change: (b: Background) => Background,
  label: string,
): Patch | null {
  const i = backgrounds.findIndex((b) => b.id === id);
  if (i < 0) return null;
  const next = change(backgrounds[i] as Background);
  if (next === backgrounds[i]) return null;
  const after = backgrounds.slice();
  after[i] = next;
  return { label, objects: {}, backgrounds: { before: [...backgrounds], after } };
}

export function removeBackgroundPatch(
  backgrounds: readonly Background[],
  id: string,
): Patch | null {
  if (!backgrounds.some((b) => b.id === id)) return null;
  return {
    label: 'Fjern bakgrunn',
    objects: {},
    backgrounds: { before: [...backgrounds], after: backgrounds.filter((b) => b.id !== id) },
  };
}

/**
 * Kobler flere portpar i ÉN angrebar handling. Par der en port allerede er brukt (også av et tidligere
 * par i samme kall) hoppes over. Returnerer patch og antall koblede par.
 */
export function connectMany(
  connections: readonly Connection[],
  pairs: ReadonlyArray<{
    a: { objectId: string; port: PortName };
    b: { objectId: string; port: PortName };
  }>,
): { patch: Patch | null; connected: number } {
  const used = new Set(
    connections.flatMap((c) => [`${c.a.objectId}:${c.a.port}`, `${c.b.objectId}:${c.b.port}`]),
  );
  const added: Connection[] = [];
  for (const { a, b } of pairs) {
    const ka = `${a.objectId}:${a.port}`;
    const kb = `${b.objectId}:${b.port}`;
    if (ka === kb || used.has(ka) || used.has(kb)) continue;
    used.add(ka);
    used.add(kb);
    added.push({ a, b });
  }
  if (!added.length) return { patch: null, connected: 0 };
  return {
    connected: added.length,
    patch: {
      label: added.length === 1 ? 'Koble spor' : `Koble ${added.length} spor`,
      objects: {},
      connections: { before: [...connections], after: [...connections, ...added] },
    },
  };
}
