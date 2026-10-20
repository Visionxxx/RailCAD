import {
  getTurnoutType,
  isCrossing,
  isDimension,
  isTrack,
  isTurnout,
  type RailProject,
  type TrackGeometry,
  type Vec2,
} from '@railcad/domain';
import type { GeometryEngine } from '@railcad/geometry-api';

/** Lagnavn er ASCII (kompatibelt med alle DXF-versjoner). */
export const LAYERS = {
  track: { name: 'RAILCAD_SPORAKSE', color: 7, label: 'Sporakser' },
  turnout: { name: 'RAILCAD_SPORVEKSEL', color: 4, label: 'Sporveksler (delvis verifisert)' },
  crossing: { name: 'RAILCAD_SPORKRYSS', color: 6, label: 'Sporkryss (ikke verifisert)' },
  dimension: { name: 'RAILCAD_MAAL', color: 2, label: 'Mål' },
  text: { name: 'RAILCAD_TEKST', color: 8, label: 'Tekst' },
} as const;

export type DxfEntity =
  | { kind: 'line'; layer: string; a: Vec2; b: Vec2 }
  /** Buer i DXF går alltid mot klokka fra `startDeg` til `endDeg` (grader). */
  | { kind: 'arc'; layer: string; center: Vec2; radius: number; startDeg: number; endDeg: number }
  | { kind: 'text'; layer: string; at: Vec2; height: number; rotationDeg: number; value: string };

export const TEXT_HEIGHT_M = 1.5;

/** Lagnavn i DXF er ASCII (store bokstaver, tall, understrek). */
export function dxfLayerSuffix(name: string): string {
  const fold = name
    .replace(/[æÆ]/g, 'AE')
    .replace(/[øØ]/g, 'O')
    .replace(/[åÅ]/g, 'AA')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return fold || 'LAG';
}

const deg = (rad: number) => ((((rad * 180) / Math.PI) % 360) + 360) % 360;

/** Én aksegeometri som DXF-entiteter. Høyrekurver skrives med buens ender byttet om (DXF-buer er alltid CCW). */
function geometryEntities(g: TrackGeometry, layer: string, engine: GeometryEngine): DxfEntity[] {
  const end = engine.endPose(g).point;
  if (g.kind === 'line') return [{ kind: 'line', layer, a: g.start, b: end }];
  const center = engine.arcCenter(g) as Vec2;
  const angleOf = (p: Vec2) => Math.atan2(p[1] - center[1], p[0] - center[0]);
  const a0 = deg(angleOf(g.start));
  const a1 = deg(angleOf(end));
  return [
    {
      kind: 'arc',
      layer,
      center,
      radius: Math.abs(g.signedRadiusM),
      startDeg: g.signedRadiusM > 0 ? a0 : a1,
      endDeg: g.signedRadiusM > 0 ? a1 : a0,
    },
  ];
}

const nf = new Intl.NumberFormat('nb-NO', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
  useGrouping: false,
});

/**
 * Bygger en versjonsuavhengig entitetsliste fra prosjektet. Geometri regnes av motoren
 * (samme som i appen), så eksporten er identisk med det som vises.
 */
export function buildEntities(project: RailProject, engine: GeometryEngine): DxfEntity[] {
  const out: DxfEntity[] = [];
  const geometryById = new Map(
    project.objects.filter(isTrack).map((o) => [o.id, o.geometry] as const),
  );
  const allPoints: Vec2[] = [];
  const layerNames = new Map((project.layers ?? []).map((l) => [l.id, l.name] as const));
  /** DXF-lag = objekttypens lag, pluss «_<LAGNAVN>» hvis objektet ligger på et eget prosjektlag. */
  const lay = (base: string, o: { layerId?: string }) => {
    const name = o.layerId ? layerNames.get(o.layerId) : undefined;
    return name && o.layerId !== 'standard' ? `${base}_${dxfLayerSuffix(name)}` : base;
  };

  for (const o of project.objects) {
    if (isTrack(o)) {
      out.push(...geometryEntities(o.geometry, lay(LAYERS.track.name, o), engine));
      allPoints.push(o.geometry.start);
    } else if (isCrossing(o)) {
      const layout = engine.crossingLayout(o.crossing);
      for (const seg of layout.segments) {
        out.push(...geometryEntities(seg, lay(LAYERS.crossing.name, o), engine));
      }
      out.push({
        kind: 'text',
        layer: LAYERS.text.name,
        height: TEXT_HEIGHT_M,
        at: [o.crossing.position[0], o.crossing.position[1] + TEXT_HEIGHT_M],
        rotationDeg: deg(o.crossing.headingRad),
        value: `${o.id}: sporkryss 1:${o.crossing.ratioN} - brukerdefinert, ikke verifisert`,
      });
      allPoints.push(o.crossing.position);
    } else if (isTurnout(o)) {
      const type = getTurnoutType(o.turnout.catalogId);
      if (!type) continue;
      const layout = engine.turnoutLayout(type, o.turnout);
      for (const seg of layout.segments)
        out.push(...geometryEntities(seg, lay(LAYERS.turnout.name, o), engine));
      out.push({
        kind: 'text',
        layer: LAYERS.text.name,
        height: TEXT_HEIGHT_M,
        at: [o.turnout.position[0], o.turnout.position[1] + TEXT_HEIGHT_M],
        rotationDeg: deg(o.turnout.headingRad),
        value: `${o.id}: ${type.name} ${type.source.drawing} - delvis verifisert`,
      });
      allPoints.push(o.turnout.position);
    } else if (isDimension(o)) {
      const layout = engine.dimensionLayout(o.dimension, (id) => geometryById.get(id));
      if (!layout) continue;
      out.push(...geometryEntities(layout.line, lay(LAYERS.dimension.name, o), engine));
      for (const [a, b] of layout.extensionLines) {
        out.push({ kind: 'line', layer: lay(LAYERS.dimension.name, o), a, b });
      }
      const n = layout.labelAngleRad + Math.PI / 2;
      out.push({
        kind: 'text',
        layer: lay(LAYERS.dimension.name, o),
        height: TEXT_HEIGHT_M,
        at: [layout.labelPoint[0] + Math.cos(n) * 0.5, layout.labelPoint[1] + Math.sin(n) * 0.5],
        rotationDeg: deg(layout.labelAngleRad),
        value: `${nf.format(layout.valueM)} m`,
      });
      allPoints.push(layout.labelPoint);
    }
  }

  const minX = allPoints.length ? Math.min(...allPoints.map((p) => p[0])) : 0;
  const minY = allPoints.length ? Math.min(...allPoints.map((p) => p[1])) : 0;
  out.push({
    kind: 'text',
    layer: LAYERS.text.name,
    height: TEXT_HEIGHT_M,
    at: [minX, minY - 4 * TEXT_HEIGHT_M],
    rotationDeg: 0,
    value: `RailCAD: ${project.project.name} - skisse, ikke regelverkskontrollert. Veksler er delvis verifisert.`,
  });
  return out;
}
