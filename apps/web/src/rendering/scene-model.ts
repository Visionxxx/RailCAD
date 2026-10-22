import {
  isCrossing,
  isTrack,
  isTurnout,
  type RailObject,
  type TrackGeometry,
  type TurnoutDefinition,
} from '@railcad/domain';
import { elevationNear, type SegmentElevation } from '@railcad/geometry-ts';
import {
  collectPolylines,
  sleepersAlong,
  type Polyline3D,
  type SleeperPlacement,
  type StripPart,
} from './scene3d';
import { turnoutParts } from './turnout-parts';

export interface SceneModel {
  lines: Polyline3D[];
  strips: StripPart[];
  sleepers: SleeperPlacement[];
}

/** Alt som 3D-oversikten tegner: akser (skinner/sporbunn), vekseldeler og sviller. */
export function buildSceneModel(
  objects: readonly RailObject[],
  segmentsOf: (o: RailObject) => { segments: TrackGeometry[]; z: SegmentElevation[] } | null,
  definitionOf: (catalogId: string) => TurnoutDefinition | undefined,
): SceneModel {
  const lines = collectPolylines(objects, segmentsOf);
  const strips: StripPart[] = [];
  const sleepers: SleeperPlacement[] = [];
  for (const l of lines) if (!l.noSleepers) sleepers.push(...sleepersAlong(l.objectId, l.points));
  for (const o of objects) {
    if (isTrack(o) || isCrossing(o) || !isTurnout(o)) continue;
    const def = definitionOf(o.turnout.catalogId);
    const se = segmentsOf(o);
    if (!def || !se) continue;
    const parts = turnoutParts(o.id, def, o.turnout, (p) => elevationNear(se.segments, se.z, p));
    strips.push(...parts.strips);
    sleepers.push(...parts.sleepers);
  }
  return { lines, strips, sleepers };
}
