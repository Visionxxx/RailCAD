import type { ArcGeometry, LineGeometry, TurnoutPlacement, TurnoutType } from '@railcad/domain';
import type { Pose, TurnoutLayout } from '@railcad/geometry-api';
import { endPose, rotateGeometry, translate } from './track';
import { add, rotate } from './vec';

/**
 * Akser for en sporveksel i lokalt system: stokkskinneskjøten (SS) i (0,0), stamsporet langs +X.
 *
 * - Stamspor: rett fra SS til x = L (byggelengde).
 * - Avvikende spor: sirkelbue med radius R fra SS, tangent til stamsporet, dreid vinkelen
 *   α = atan(1/n) (stigning 1:n). Deretter rett `D` langs tangenten (rettlinjet parti i avvik).
 *   Tangentlengden til sirkelen er A = C = R·tan(α/2), som stemmer med TRV-hovedmålene.
 *
 * Venstre veksel dreier mot +Y, høyre mot −Y.
 */
function localLayout(type: TurnoutType, hand: 'left' | 'right') {
  const sign = hand === 'left' ? 1 : -1;
  const m = type.mainDimensionsMm;
  const alpha = Math.atan(1 / type.ratioN);
  const stem: LineGeometry = { kind: 'line', start: [0, 0], headingRad: 0, lengthM: m.L / 1000 };
  const arc: ArcGeometry = {
    kind: 'arc',
    start: [0, 0],
    headingRad: 0,
    signedRadiusM: sign * type.radiusM,
    sweepRad: alpha,
  };
  const segments: Array<LineGeometry | ArcGeometry> = [stem, arc];
  const arcEnd = endPose(arc);
  let divergingEnd: Pose = arcEnd;
  if (m.D && m.D > 0) {
    const straight: LineGeometry = {
      kind: 'line',
      start: arcEnd.point,
      headingRad: arcEnd.headingRad,
      lengthM: m.D / 1000,
    };
    segments.push(straight);
    divergingEnd = endPose(straight);
  }
  const ports = {
    stem_in: { point: [0, 0] as const, headingRad: Math.PI },
    stem_out: endPose(stem),
    diverging_out: divergingEnd,
  };
  return { segments, ports };
}

export function turnoutLayout(type: TurnoutType, placement: TurnoutPlacement): TurnoutLayout {
  const local = localLayout(type, placement.hand);
  const h = placement.headingRad;
  const place = (g: LineGeometry | ArcGeometry) =>
    translate(rotateGeometry(g, [0, 0], h), placement.position[0], placement.position[1]);
  const placePose = (p: Pose): Pose => ({
    point: add(rotate(p.point, h), placement.position),
    headingRad: p.headingRad + h,
  });
  return {
    segments: local.segments.map(place),
    ports: {
      stem_in: placePose(local.ports.stem_in),
      stem_out: placePose(local.ports.stem_out),
      diverging_out: placePose(local.ports.diverging_out),
    },
  };
}
