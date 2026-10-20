import type { Background, Connection, ProjectLayer, RailObject } from '@railcad/domain';

/**
 * En redigering som data: hvert berørt objekt har før/etter-tilstand og posisjon i
 * objektlisten. `before: null` = opprettet, `after: null` = slettet.
 * Å angre og gjøre om er dermed deterministisk og uavhengig av hvordan endringen ble laget.
 */
export interface Patch {
  label: string;
  objects: Record<string, { before: RailObject | null; after: RailObject | null; index: number }>;
  connections?: { before: Connection[]; after: Connection[] };
  /** Referansebakgrunner (hele listen før/etter – elementene deles, så det koster ingen kopiering). */
  backgrounds?: { before: Background[]; after: Background[] };
  /** Bekreftede kryssinger (`idA|idB`). */
  crossingAcks?: { before: string[]; after: string[] };
  /** Lagliste (inkl. standardlaget). */
  layers?: { before: ProjectLayer[]; after: ProjectLayer[] };
}

export interface ModelState {
  objects: RailObject[];
  connections: Connection[];
  backgrounds: Background[];
  crossingAcks: string[];
  layers: ProjectLayer[];
}

export function applyPatch(state: ModelState, patch: Patch, direction: 'do' | 'undo'): ModelState {
  const result = state.objects.slice();
  const indexOf = new Map(result.map((o, i) => [o.id, i] as const));
  const inserts: Array<{ index: number; object: RailObject }> = [];
  const removals: number[] = [];

  for (const [id, entry] of Object.entries(patch.objects)) {
    const from = direction === 'do' ? entry.before : entry.after;
    const to = direction === 'do' ? entry.after : entry.before;
    if (from && to) {
      const i = indexOf.get(id);
      if (i !== undefined) result[i] = to;
    } else if (from && !to) {
      const i = indexOf.get(id);
      if (i !== undefined) removals.push(i);
    } else if (!from && to) {
      inserts.push({ index: entry.index, object: to });
    }
  }
  for (const i of removals.sort((a, b) => b - a)) result.splice(i, 1);
  for (const { index, object } of inserts.sort((a, b) => a.index - b.index)) {
    result.splice(Math.min(index, result.length), 0, object);
  }

  let connections = state.connections;
  if (patch.connections) {
    connections = direction === 'do' ? patch.connections.after : patch.connections.before;
  }
  let backgrounds = state.backgrounds;
  if (patch.backgrounds) {
    backgrounds = direction === 'do' ? patch.backgrounds.after : patch.backgrounds.before;
  }
  let crossingAcks = state.crossingAcks;
  if (patch.crossingAcks) {
    crossingAcks = direction === 'do' ? patch.crossingAcks.after : patch.crossingAcks.before;
  }
  let layers = state.layers;
  if (patch.layers) {
    layers = direction === 'do' ? patch.layers.after : patch.layers.before;
  }
  return { objects: result, connections, backgrounds, crossingAcks, layers };
}
