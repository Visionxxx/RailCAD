import { CURRENT_SCHEMA_VERSION } from './validation';
import type { RailObject, RailProject } from './types';

export function createEmptyProject(name = 'Nytt prosjekt'): RailProject {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: {
      id: `prosjekt-${Date.now().toString(36)}`,
      name,
      units: 'm',
      coordinateSystem: { type: 'local_xy' },
    },
    objects: [],
    connections: [],
  };
}

export function serializeProject(project: RailProject): string {
  return JSON.stringify(project, null, 2) + '\n';
}

/** Neste ledige ID, f.eks. `track-004`. Deterministisk: høyeste eksisterende nummer + 1. */
export function nextId(prefix: string, existing: Iterable<string>): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of existing) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

export function idPrefix(type: RailObject['type']): string {
  return type === 'track_segment' ? 'track' : 'dim';
}
