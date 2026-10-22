import {
  findTurnoutDefinition,
  isCrossing,
  isTrack,
  isTurnout,
  type RailObject,
  type TrackGeometry,
  type Vec2,
} from '@railcad/domain';
import type { GeometryEngine } from '@railcad/geometry-api';

export type GhostOp =
  { type: 'move'; dx: number; dy: number } | { type: 'rotate'; pivot: Vec2; angleRad: number };

/**
 * Akser for forhåndsvisning av et objekt etter flytting/rotasjon (spor og sporveksler).
 * Må gi samme resultat som `transformObjects`, slik at forhåndsvisningen stemmer med det som lagres.
 */
export function ghostGeometries(
  o: RailObject,
  op: GhostOp,
  engine: GeometryEngine,
): TrackGeometry[] {
  if (isTrack(o)) {
    return [
      op.type === 'move'
        ? engine.translate(o.geometry, op.dx, op.dy)
        : engine.rotate(o.geometry, op.pivot, op.angleRad),
    ];
  }
  if (isCrossing(o)) {
    const p = o.crossing.position;
    const position: Vec2 =
      op.type === 'move'
        ? [p[0] + op.dx, p[1] + op.dy]
        : engine.rotate(
            { kind: 'line', start: p, headingRad: 0, lengthM: 1 },
            op.pivot,
            op.angleRad,
          ).start;
    const headingRad = o.crossing.headingRad + (op.type === 'rotate' ? op.angleRad : 0);
    return engine.crossingLayout({ ...o.crossing, position, headingRad }).segments;
  }
  if (isTurnout(o)) {
    const type = findTurnoutDefinition(o.turnout.catalogId);
    if (!type) return [];
    const p = o.turnout.position;
    const position: Vec2 =
      op.type === 'move'
        ? [p[0] + op.dx, p[1] + op.dy]
        : engine.rotate(
            { kind: 'line', start: p, headingRad: 0, lengthM: 1 },
            op.pivot,
            op.angleRad,
          ).start;
    const headingRad = o.turnout.headingRad + (op.type === 'rotate' ? op.angleRad : 0);
    return engine.turnoutLayout(type, { ...o.turnout, position, headingRad }).segments;
  }
  return [];
}
