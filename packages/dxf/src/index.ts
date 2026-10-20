import type { RailProject } from '@railcad/domain';
import type { GeometryEngine } from '@railcad/geometry-api';
import { buildEntities } from './entities';
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
  return version === 'R12'
    ? writeR12(
        entities,
        `RailCAD ${project.project.name} (${project.schemaVersion}) - units: meters`,
      )
    : writeR2007(entities);
}
export { readDxfBackground, cleanMText, type DxfReadResult, type DxfReadOutcome } from './read';
