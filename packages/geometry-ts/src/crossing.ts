import type { ArcGeometry, CrossingPlacement, LineGeometry, TrackGeometry } from '@railcad/domain';
import type { CrossingLayout } from '@railcad/geometry-api';
import { add, mul, unit } from './vec';

/**
 * Sporkryss: spor A langs `headingRad` og spor B langs `headingRad + α` (α = atan(1/n), mot klokka),
 * begge rette og med midten i M. Utgående retninger: slutt = akseretning, start = akseretning + π.
 */
export function crossingLayout(p: CrossingPlacement): CrossingLayout {
  const alpha = Math.atan(1 / p.ratioN);
  const axis = (heading: number): LineGeometry => {
    const start = add(p.position, mul(unit(heading), -p.halfLengthM));
    return { kind: 'line', start, headingRad: heading, lengthM: 2 * p.halfLengthM };
  };
  const hA = p.headingRad;
  const hB = p.headingRad + alpha;
  const a = axis(hA);
  const b = axis(hB);
  const end = (g: LineGeometry) => add(g.start, mul(unit(g.headingRad), g.lengthM));
  const segments: TrackGeometry[] = [a, b];
  if (p.slip) {
    // Tangentlengde fra M langs begge aksene: T = R·tan(α/2). Buene tangerer aksene i ±T.
    const t = p.slip.radiusM * Math.tan(alpha / 2);
    const onAxis = (heading: number, dist: number) => add(p.position, mul(unit(heading), dist));
    if (p.slip.arcs === 'ab' || p.slip.arcs === 'both') {
      const arc: ArcGeometry = {
        kind: 'arc',
        start: onAxis(hA, -t),
        headingRad: hA,
        signedRadiusM: p.slip.radiusM,
        sweepRad: alpha,
      };
      segments.push(arc);
    }
    if (p.slip.arcs === 'ba' || p.slip.arcs === 'both') {
      const arc: ArcGeometry = {
        kind: 'arc',
        start: onAxis(hB, -t),
        headingRad: hB,
        signedRadiusM: -p.slip.radiusM,
        sweepRad: alpha,
      };
      segments.push(arc);
    }
  }
  return {
    segments,
    ports: {
      a_start: { point: a.start, headingRad: hA + Math.PI },
      a_end: { point: end(a), headingRad: hA },
      b_start: { point: b.start, headingRad: hB + Math.PI },
      b_end: { point: end(b), headingRad: hB },
    },
  };
}
