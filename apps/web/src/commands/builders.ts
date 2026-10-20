import {
  type Background,
  idPrefix,
  isDimension,
  isTrack,
  isTurnout,
  isCrossing,
  type CrossingPlacement,
  nextId,
  type Connection,
  type DimensionSpec,
  type PortName,
  type RailObject,
  type TrackGeometry,
  type TurnoutPlacement,
  type Vec2,
} from '@railcad/domain';
import type { AssemblyPlan, GeometryEngine } from '@railcad/geometry-api';
import type { Patch } from './patch';
import { DEFAULT_LAYER_ID, type ProjectLayer } from '@railcad/domain';

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
  /** Låste objekter (effektivt) – slettes ikke. */
  skip?: ReadonlySet<string>,
): Patch | null {
  const doomed = new Set([...ids].filter((id) => !skip?.has(id)));
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
  /** Låste objekter (effektivt) – flyttes/roteres ikke. */
  skip?: ReadonlySet<string>,
): Patch | null {
  const movePoint = (p: Vec2): Vec2 =>
    op.type === 'move'
      ? [p[0] + op.dx, p[1] + op.dy]
      : engine.rotate({ kind: 'line', start: p, headingRad: 0, lengthM: 1 }, op.pivot, op.angleRad)
          .start;
  const replacements = new Map<string, RailObject>();
  for (const o of objects) {
    if (!ids.has(o.id) || skip?.has(o.id)) continue;
    if (isTrack(o)) {
      const geometry =
        op.type === 'move'
          ? engine.translate(o.geometry, op.dx, op.dy)
          : engine.rotate(o.geometry, op.pivot, op.angleRad);
      replacements.set(o.id, { ...o, geometry });
    } else if (isCrossing(o)) {
      replacements.set(o.id, {
        ...o,
        crossing: {
          ...o.crossing,
          position: movePoint(o.crossing.position),
          headingRad: o.crossing.headingRad + (op.type === 'rotate' ? op.angleRad : 0),
        },
      });
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

/** Bekrefter (eller opphever bekreftelse av) at kryssingen mellom to objekter er bevisst. */
export function toggleCrossingAckPatch(acks: readonly string[], key: string): Patch {
  const has = acks.includes(key);
  return {
    label: has ? 'Opphev planskilt-bekreftelse' : 'Bekreft planskilt kryssing',
    objects: {},
    crossingAcks: {
      before: [...acks],
      after: has ? acks.filter((k) => k !== key) : [...acks, key],
    },
  };
}

/** Plasserer et sporkryss. Med `anchor` kobles spor A sin start (a_start) til en eksisterende port. */
export function createCrossing(
  objects: readonly RailObject[],
  connections: readonly Connection[],
  placement: CrossingPlacement,
  anchor?: { objectId: string; port: PortName },
): { patch: Patch; id: string } {
  const id = nextId(
    'crossing',
    objects.map((o) => o.id),
  );
  const object: RailObject = { id, type: 'crossing', crossing: placement };
  const patch: Patch = {
    label: 'Plasser sporkryss',
    objects: { [id]: { before: null, after: object, index: objects.length } },
  };
  if (anchor) {
    patch.connections = {
      before: [...connections],
      after: [...connections, { a: anchor, b: { objectId: id, port: 'a_start' } }],
    };
  }
  return { patch, id };
}

// ---------- Lås og lag ----------

/** Setter eller fjerner `locked` på objekter. */
export function setLockedPatch(
  objects: readonly RailObject[],
  ids: ReadonlySet<string>,
  locked: boolean,
): Patch | null {
  const replacements = new Map<string, RailObject>();
  for (const o of objects) {
    if (!ids.has(o.id) || !!o.locked === locked) continue;
    const next = { ...o, locked } as RailObject;
    if (!locked) delete next.locked;
    replacements.set(o.id, next);
  }
  return replaceObjects(objects, replacements, locked ? 'Lås objekter' : 'Lås opp objekter');
}

/** Flytter objekter til et lag (standardlaget = uten `layerId`). Låste objekter hoppes over. */
export function setLayerPatch(
  objects: readonly RailObject[],
  ids: ReadonlySet<string>,
  layerId: string,
  skip?: ReadonlySet<string>,
): Patch | null {
  const replacements = new Map<string, RailObject>();
  for (const o of objects) {
    if (!ids.has(o.id) || skip?.has(o.id)) continue;
    if ((o.layerId ?? DEFAULT_LAYER_ID) === layerId) continue;
    const next = { ...o } as RailObject;
    if (layerId === DEFAULT_LAYER_ID) delete next.layerId;
    else next.layerId = layerId;
    replacements.set(o.id, next);
  }
  return replaceObjects(objects, replacements, 'Flytt til lag');
}

export function addLayerPatch(layers: readonly ProjectLayer[], layer: ProjectLayer): Patch {
  return {
    label: 'Nytt lag',
    objects: {},
    layers: { before: [...layers], after: [...layers, layer] },
  };
}

export function updateLayerPatch(
  layers: readonly ProjectLayer[],
  id: string,
  change: (l: ProjectLayer) => ProjectLayer,
  label: string,
): Patch | null {
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return null;
  const next = change(layers[i] as ProjectLayer);
  if (next === layers[i]) return null;
  const after = layers.slice();
  after[i] = next;
  return { label, objects: {}, layers: { before: [...layers], after } };
}

/** Sletter et lag; objektene på laget flyttes til standardlaget i samme angrebare handling. */
export function removeLayerPatch(
  layers: readonly ProjectLayer[],
  objects: readonly RailObject[],
  id: string,
): Patch | null {
  if (id === DEFAULT_LAYER_ID || !layers.some((l) => l.id === id)) return null;
  const moved = setLayerPatch(
    objects,
    new Set(objects.filter((o) => o.layerId === id).map((o) => o.id)),
    DEFAULT_LAYER_ID,
  );
  return {
    label: 'Slett lag',
    objects: moved?.objects ?? {},
    layers: { before: [...layers], after: layers.filter((l) => l.id !== id) },
  };
}

// ---------- Kopiér / lim inn ----------

export interface Clipboard {
  objects: RailObject[];
  connections: Connection[];
}

/** Utklipp av valgte objekter: lengdemål uten kopiert mål-spor tas ikke med, koblinger bare mellom kopierte. */
export function copyObjects(
  objects: readonly RailObject[],
  connections: readonly Connection[],
  ids: ReadonlySet<string>,
): Clipboard | null {
  const picked = objects.filter((o) => ids.has(o.id));
  const pickedIds = new Set(picked.map((o) => o.id));
  const keep = picked.filter(
    (o) =>
      !(isDimension(o) && o.dimension.kind === 'length' && !pickedIds.has(o.dimension.targetId)),
  );
  if (!keep.length) return null;
  const keptIds = new Set(keep.map((o) => o.id));
  return {
    objects: keep,
    connections: connections.filter((c) => keptIds.has(c.a.objectId) && keptIds.has(c.b.objectId)),
  };
}

/**
 * Limer inn utklippet med nye ID-er, flyttet med (dx, dy). Koblinger mellom de limte objektene
 * følger med, lengdemål peker på de nye sporene, og låsing fjernes. Ett angrebart trinn.
 */
export function pasteObjects(
  objects: readonly RailObject[],
  connections: readonly Connection[],
  clip: Clipboard,
  delta: Vec2,
  engine: GeometryEngine,
  layerFor: (original: RailObject) => string,
): { patch: Patch; ids: string[] } {
  const existing = objects.map((o) => o.id);
  const idMap = new Map<string, string>();
  for (const o of clip.objects) {
    const id = nextId(idPrefix(o.type), existing);
    existing.push(id);
    idMap.set(o.id, id);
  }
  const [dx, dy] = delta;
  const move = (p: Vec2): Vec2 => [p[0] + dx, p[1] + dy];
  const entries: Patch['objects'] = {};
  let index = objects.length;
  const created: RailObject[] = [];
  for (const o of clip.objects) {
    const id = idMap.get(o.id) as string;
    let copy: RailObject;
    if (isTrack(o)) copy = { ...o, id, geometry: engine.translate(o.geometry, dx, dy) };
    else if (isTurnout(o))
      copy = { ...o, id, turnout: { ...o.turnout, position: move(o.turnout.position) } };
    else if (isCrossing(o))
      copy = { ...o, id, crossing: { ...o.crossing, position: move(o.crossing.position) } };
    else if (o.dimension.kind === 'length') {
      copy = {
        ...o,
        id,
        dimension: { ...o.dimension, targetId: idMap.get(o.dimension.targetId) as string },
      };
    } else {
      copy = {
        ...o,
        id,
        dimension: { ...o.dimension, a: move(o.dimension.a), b: move(o.dimension.b) },
      };
    }
    delete copy.locked;
    const layer = layerFor(o);
    if (layer === DEFAULT_LAYER_ID) delete copy.layerId;
    else copy.layerId = layer;
    created.push(copy);
    entries[id] = { before: null, after: copy, index: index++ };
  }
  const newConns: Connection[] = clip.connections.map((c) => ({
    a: { objectId: idMap.get(c.a.objectId) as string, port: c.a.port },
    b: { objectId: idMap.get(c.b.objectId) as string, port: c.b.port },
  }));
  const patch: Patch = {
    label: created.length === 1 ? 'Lim inn' : `Lim inn ${created.length} objekter`,
    objects: entries,
  };
  if (newConns.length) {
    patch.connections = { before: [...connections], after: [...connections, ...newConns] };
  }
  return { patch, ids: created.map((o) => o.id) };
}

/**
 * Oppretter en sammenstilling (flere objekter + koblinger mellom dem) som ÉN angrebar handling.
 * `plan.parts[].key` oversettes til nye objekt-ID-er; returnerer nøkkel→ID og alle nye ID-er.
 */
export function createAssembly(
  objects: readonly RailObject[],
  connections: readonly Connection[],
  plan: Extract<AssemblyPlan, { ok: true }>,
  label: string,
): { patch: Patch; ids: string[]; idByKey: Map<string, string> } {
  const existing = objects.map((o) => o.id);
  const idByKey = new Map<string, string>();
  const entries: Patch['objects'] = {};
  let index = objects.length;
  for (const part of plan.parts) {
    const type: RailObject['type'] =
      part.kind === 'turnout' ? 'turnout' : part.kind === 'crossing' ? 'crossing' : 'track_segment';
    const id = nextId(idPrefix(type), existing);
    existing.push(id);
    idByKey.set(part.key, id);
    const object: RailObject =
      part.kind === 'turnout'
        ? { id, type: 'turnout', turnout: part.turnout as TurnoutPlacement }
        : part.kind === 'crossing'
          ? { id, type: 'crossing', crossing: part.crossing as CrossingPlacement }
          : { id, type: 'track_segment', geometry: part.track as TrackGeometry };
    entries[id] = { before: null, after: object, index: index++ };
  }
  const added: Connection[] = plan.links.map((l) => ({
    a: { objectId: idByKey.get(l.a.key) as string, port: l.a.port },
    b: { objectId: idByKey.get(l.b.key) as string, port: l.b.port },
  }));
  return {
    patch: {
      label,
      objects: entries,
      connections: { before: [...connections], after: [...connections, ...added] },
    },
    ids: [...idByKey.values()],
    idByKey,
  };
}
