import type { CrossingPlacement, LineGeometry } from '@railcad/domain';
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
  return {
    segments: [a, b],
    ports: {
      a_start: { point: a.start, headingRad: hA + Math.PI },
      a_end: { point: end(a), headingRad: hA },
      b_start: { point: b.start, headingRad: hB + Math.PI },
      b_end: { point: end(b), headingRad: hB },
    },
  };
}
