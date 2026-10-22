import { isCrossing, isDimension, isTrack, isTurnout, type RailObject } from '@railcad/domain';
import type { Bounds } from '@railcad/geometry-api';
import { crossingBounds } from './crossings';
import { cachedBounds } from './paths';
import { turnoutBounds } from './turnouts';

/** Avgrensningsboks for et objekt (null for lengdemål, som følger sporet de måler). */
export function objectBounds(o: RailObject): Bounds | null {
  if (isTrack(o)) return cachedBounds(o.geometry);
  if (isTurnout(o)) return turnoutBounds(o);
  if (isCrossing(o)) return crossingBounds(o);
  if (isDimension(o) && o.dimension.kind === 'distance') {
    const { a, b } = o.dimension;
    return {
      minX: Math.min(a[0], b[0]),
      minY: Math.min(a[1], b[1]),
      maxX: Math.max(a[0], b[0]),
      maxY: Math.max(a[1], b[1]),
    };
  }
  return null;
}
