import {
  isCrossing,
  isDimension,
  isTrack,
  isTurnout,
  type RailObject,
  type Vec2,
} from '@railcad/domain';
import { geometryEngine as engine } from '../engine';
import { cachedBounds } from '../rendering/paths';
import { cachedCrossingLayout, crossingBounds } from '../rendering/crossings';
import { cachedTurnoutLayout, turnoutBounds } from '../rendering/turnouts';

export interface Pick {
  id: string;
  distanceM: number;
  /** Nærmeste punkt på objektet. */
  point: Vec2;
}

/** Finner objektet nærmest `world` innenfor `tolM`. Avgrensningsbokser sorterer bort de fleste spor først. */
export function pickObject(
  objects: readonly RailObject[],
  byId: ReadonlyMap<string, RailObject>,
  world: Vec2,
  tolM: number,
  filter?: (o: RailObject) => boolean,
): Pick | null {
  let best: Pick | null = null;
  const take = (id: string, point: Vec2, distanceM: number) => {
    if (distanceM <= tolM && (!best || distanceM < best.distanceM)) best = { id, point, distanceM };
  };
  for (const o of objects) {
    if (filter && !filter(o)) continue;
    if (isTrack(o)) {
      const b = cachedBounds(o.geometry);
      if (
        world[0] < b.minX - tolM ||
        world[0] > b.maxX + tolM ||
        world[1] < b.minY - tolM ||
        world[1] > b.maxY + tolM
      ) {
        continue;
      }
      const c = engine.closestPoint(o.geometry, world);
      take(o.id, c.point, c.distanceM);
    } else if (isCrossing(o)) {
      const b = crossingBounds(o);
      if (
        world[0] < b.minX - tolM ||
        world[0] > b.maxX + tolM ||
        world[1] < b.minY - tolM ||
        world[1] > b.maxY + tolM
      ) {
        continue;
      }
      for (const seg of cachedCrossingLayout(o).segments) {
        const c = engine.closestPoint(seg, world);
        take(o.id, c.point, c.distanceM);
      }
    } else if (isTurnout(o)) {
      const b = turnoutBounds(o);
      if (
        !b ||
        world[0] < b.minX - tolM ||
        world[0] > b.maxX + tolM ||
        world[1] < b.minY - tolM ||
        world[1] > b.maxY + tolM
      ) {
        continue;
      }
      for (const seg of cachedTurnoutLayout(o)?.segments ?? []) {
        const c = engine.closestPoint(seg, world);
        take(o.id, c.point, c.distanceM);
      }
    } else if (isDimension(o)) {
      const layout = engine.dimensionLayout(o.dimension, (id) => {
        const t = byId.get(id);
        return t && isTrack(t) ? t.geometry : undefined;
      });
      if (!layout) continue;
      const c = engine.closestPoint(layout.line, world);
      take(o.id, c.point, c.distanceM);
      const l = layout.labelPoint;
      take(o.id, l, Math.hypot(l[0] - world[0], l[1] - world[1]) - tolM * 2);
    }
  }
  return best;
}
