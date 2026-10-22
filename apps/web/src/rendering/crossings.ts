import type { CrossingObject } from '@railcad/domain';
import type { Bounds, CrossingLayout } from '@railcad/geometry-api';
import { geometryEngine as engine } from '../engine';
import { cachedBounds } from './paths';

const layouts = new WeakMap<CrossingObject, CrossingLayout>();
const boundsCache = new WeakMap<CrossingObject, Bounds>();

/** Akser og porter for et plassert sporkryss (cachet pr. objekt – objektene er uforanderlige). */
export function cachedCrossingLayout(o: CrossingObject): CrossingLayout {
  let l = layouts.get(o);
  if (!l) {
    l = engine.crossingLayout(o.crossing);
    layouts.set(o, l);
  }
  return l;
}

export function crossingBounds(o: CrossingObject): Bounds {
  let b = boundsCache.get(o);
  if (!b) {
    const [a, c] = cachedCrossingLayout(o).segments.map((g) => cachedBounds(g)) as [Bounds, Bounds];
    b = {
      minX: Math.min(a.minX, c.minX),
      minY: Math.min(a.minY, c.minY),
      maxX: Math.max(a.maxX, c.maxX),
      maxY: Math.max(a.maxY, c.maxY),
    };
    boundsCache.set(o, b);
  }
  return b;
}
