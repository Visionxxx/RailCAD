import {
  TURNOUT_CATALOG_REVISION as _REV,
  definitionFromCatalog,
  type ArcGeometry,
  type LineGeometry,
  type TrackGeometry,
  type TurnoutDefinition,
  type TurnoutPlacement,
  type TurnoutPortName,
  type TurnoutType,
} from '@railcad/domain';
import type { Pose, TurnoutLayout, TurnoutRoute } from '@railcad/geometry-api';
import { endPose, rotateGeometry, translate } from './track';
import { add, rotate } from './vec';

void _REV;

/** Katalogtype eller definisjon → definisjon. */
export function asDefinition(t: TurnoutType | TurnoutDefinition): TurnoutDefinition {
  return 'branches' in t ? t : definitionFromCatalog(t);
}

/**
 * Akser for en veksel i lokalt system: stokkskinneskjøten (SS) i (0,0), stamsporet langs +X.
 *
 * - Stamspor (hvis det finnes): rett fra SS, lengde `stemLengthM`.
 * - Hver gren: sirkelbue med radius R fra SS, tangent til stamsporet, dreid α = atan(1/n)
 *   (venstre mot +Y, høyre mot −Y), deretter rett `straightM` langs buens sluttangent.
 *   For katalogtypene er tangentlengden A = C = R·tan(α/2), som stemmer med TRV-hovedmålene.
 * `mirror` speiler hele vekselen (alle grener bytter side).
 */
function localLayout(def: TurnoutDefinition, mirror: boolean) {
  const segments: Array<LineGeometry | ArcGeometry> = [];
  const routes: TurnoutRoute[] = [];
  const ports: Partial<Record<TurnoutPortName, Pose>> = {
    stem_in: { point: [0, 0], headingRad: Math.PI },
  };
  if (def.stemLengthM !== null) {
    const stem: LineGeometry = {
      kind: 'line',
      start: [0, 0],
      headingRad: 0,
      lengthM: def.stemLengthM,
    };
    segments.push(stem);
    routes.push({ port: 'stem_out', segments: [0] });
    ports.stem_out = endPose(stem);
  }
  def.branches.forEach((b, i) => {
    const leftward = (b.hand === 'left') !== mirror;
    const alpha = Math.atan(1 / b.ratioN);
    const arc: ArcGeometry = {
      kind: 'arc',
      start: [0, 0],
      headingRad: 0,
      signedRadiusM: (leftward ? 1 : -1) * b.radiusM,
      sweepRad: alpha,
    };
    const idx = [segments.length];
    segments.push(arc);
    let last: Pose = endPose(arc);
    if (b.straightM > 0) {
      const straight: LineGeometry = {
        kind: 'line',
        start: last.point,
        headingRad: last.headingRad,
        lengthM: b.straightM,
      };
      idx.push(segments.length);
      segments.push(straight);
      last = endPose(straight);
    }
    const port: TurnoutPortName = i === 0 ? 'diverging_out' : 'diverging2_out';
    routes.push({ port, segments: idx });
    ports[port] = last;
  });
  return { segments, routes, ports };
}

export function turnoutLayout(
  type: TurnoutType | TurnoutDefinition,
  placement: TurnoutPlacement,
): TurnoutLayout {
  const def = asDefinition(type);
  const local = localLayout(def, placement.hand === 'right');
  const h = placement.headingRad;
  const place = (g: TrackGeometry): TrackGeometry =>
    translate(rotateGeometry(g, [0, 0], h), placement.position[0], placement.position[1]);
  const placePose = (p: Pose): Pose => ({
    point: add(rotate(p.point, h), placement.position),
    headingRad: p.headingRad + h,
  });
  const ports: Partial<Record<TurnoutPortName, Pose>> = {};
  for (const [k, v] of Object.entries(local.ports))
    ports[k as TurnoutPortName] = placePose(v as Pose);
  return { segments: local.segments.map(place), ports, routes: local.routes };
}
