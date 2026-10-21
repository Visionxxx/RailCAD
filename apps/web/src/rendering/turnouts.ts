import { findTurnoutDefinition, type TurnoutDefinition, type TurnoutObject } from '@railcad/domain';
import type { Bounds, TurnoutLayout } from '@railcad/geometry-api';
import { geometryEngine as engine } from '../engine';
import { cachedBounds } from './paths';

const layoutCache = new WeakMap<
  TurnoutObject,
  { def: TurnoutDefinition | undefined; layout: TurnoutLayout | null }
>();
const boundsCache = new WeakMap<
  TurnoutObject,
  { layout: TurnoutLayout | null; b: Bounds | null }
>();

/**
 * Akser og porter for en plassert sporveksel. Objektene er uforanderlige, så objektidentitet er
 * nøkkel. Null hvis katalogtypen ikke finnes (skal ikke skje etter validering).
 */
export function cachedTurnoutLayout(o: TurnoutObject): TurnoutLayout | null {
  const def = findTurnoutDefinition(o.turnout.catalogId);
  const hit = layoutCache.get(o);
  if (hit && hit.def === def) return hit.layout;
  const layout = def ? engine.turnoutLayout(def, o.turnout) : null;
  layoutCache.set(o, { def, layout });
  return layout;
}

export function turnoutBounds(o: TurnoutObject): Bounds | null {
  const layout = cachedTurnoutLayout(o);
  const hit = boundsCache.get(o);
  if (hit && hit.layout === layout) return hit.b;
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
  boundsCache.set(o, { layout, b });
  return b;
}
