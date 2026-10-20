import type { RailProject } from '@railcad/domain';
import type { GeometryEngine } from '@railcad/geometry-api';
import { buildEntities, LAYERS } from './entities';
import { writeR12, writeR2007, type DxfVersion } from './write';

export { buildEntities, LAYERS, type DxfEntity } from './entities';
export { writeR12, writeR2007, type DxfVersion } from './write';

/**
 * Eksporterer prosjektet som DXF-tekst. Alle objekter skrives som LINE/ARC/TEXT i meter,
 * fordelt på lag (sporakse, sporveksel, mål, tekst). Måltall skrives som tekst, ikke DIMENSION.
 */
export function exportDxf(
  project: RailProject,
  engine: GeometryEngine,
  version: DxfVersion,
): string {
  const entities = buildEntities(project, engine);
  // Faste lag + eventuelle prosjektlag (`<TYPELAG>_<LAGNAVN>`, samme farge som typelaget).
  const base = Object.values(LAYERS) as ReadonlyArray<{ name: string; color: number }>;
  const known = new Set(base.map((l) => l.name));
  const extra = [...new Set(entities.map((e) => e.layer))]
    .filter((n) => !known.has(n))
    .map((n) => ({
      name: n,
      color:
        base
          .filter((b) => n.startsWith(`${b.name}_`))
          .sort((a, b) => b.name.length - a.name.length)[0]?.color ?? 7,
    }));
  const layers = [...base, ...extra];
  return version === 'R12'
    ? writeR12(
        entities,
        `RailCAD ${project.project.name} (${project.schemaVersion}) - units: meters`,
        layers,
      )
    : writeR2007(entities, layers);
}
export { readDxfBackground, cleanMText, type DxfReadResult, type DxfReadOutcome } from './read';
