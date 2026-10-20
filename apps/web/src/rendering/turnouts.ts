import { getTurnoutType, type TurnoutObject } from '@railcad/domain';
import type { Bounds, TurnoutLayout } from '@railcad/geometry-api';
import { geometryEngine as engine } from '../engine';
import { cachedBounds } from './paths';

const layoutCache = new WeakMap<TurnoutObject, TurnoutLayout | null>();
const boundsCache = new WeakMap<TurnoutObject, Bounds | null>();

/**
 * Akser og porter for en plassert sporveksel. Objektene er uforanderlige, så objektidentitet er
 * nøkkel. Null hvis katalogtypen ikke finnes (skal ikke skje etter validering).
 */
export function cachedTurnoutLayout(o: TurnoutObject): TurnoutLayout | null {
  if (layoutCache.has(o)) return layoutCache.get(o) ?? null;
  const type = getTurnoutType(o.turnout.catalogId);
  const layout = type ? engine.turnoutLayout(type, o.turnout) : null;
  layoutCache.set(o, layout);
  return layout;
}

export function turnoutBounds(o: TurnoutObject): Bounds | null {
  if (boundsCache.has(o)) return boundsCache.get(o) ?? null;
  const layout = cachedTurnoutLayout(o);
  let b: Bounds | null = null;
  if (layout) {
    for (const seg of layout.segments) {
      const sb = cachedBounds(seg);
      b = b
        ? {
            minX: Math.min(b.minX, sb.minX),
            minY: Math.min(b.minY, sb.minY),
            maxX: Math.max(b.maxX, sb.maxX),
            maxY: Math.max(b.maxY, sb.maxY),
          }
        : { ...sb };
    }
  }
  boundsCache.set(o, b);
  return b;
}
