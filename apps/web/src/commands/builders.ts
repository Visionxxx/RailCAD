import {
  idPrefix, isDimension, isTrack, nextId,
  type Connection, type DimensionSpec, type RailObject, type TrackGeometry, type Vec2,
} from '@railcad/domain';
import type { GeometryEngine } from '@railcad/geometry-api';
import type { Patch } from './patch';

/** Rene funksjoner som bygger `Patch` fra gjeldende modell. Ingen tilstand, ingen Vue. */

export function createTrack(
  objects: readonly RailObject[],
  geometry: TrackGeometry,
): { patch: Patch; id: string } {
  const id = nextId(idPrefix('track_segment'), objects.map((o) => o.id));
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
  const id = nextId(idPrefix('dimension'), objects.map((o) => o.id));
  const object: RailObject = { id, type: 'dimension', dimension };
  return {
    id,
    patch: { label: 'Nytt mål', objects: { [id]: { before: null, after: object, index: objects.length } } },
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
      : engine.rotate({ kind: 'line', start: p, headingRad: 0, lengthM: 1 }, op.pivot, op.angleRad).start;
  const replacements = new Map<string, RailObject>();
  for (const o of objects) {
    if (!ids.has(o.id)) continue;
    if (isTrack(o)) {
      const geometry =
        op.type === 'move'
          ? engine.translate(o.geometry, op.dx, op.dy)
          : engine.rotate(o.geometry, op.pivot, op.angleRad);
      replacements.set(o.id, { ...o, geometry });
    } else if (o.dimension.kind === 'distance') {
      replacements.set(o.id, {
        ...o,
        dimension: { ...o.dimension, a: movePoint(o.dimension.a), b: movePoint(o.dimension.b) },
      });
    }
  }
  return replaceObjects(objects, replacements, label);
}
