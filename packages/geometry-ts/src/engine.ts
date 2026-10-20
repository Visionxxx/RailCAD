import { TOLERANCES, type GeometryEngine } from '@railcad/geometry-api';
import { dimensionLayout } from './dimension';
import { snap } from './snap';
import { findIntersections } from './intersect';
import { evaluateConnections, findCoincidentFreePorts } from './topology';
import { turnoutLayout } from './turnout';
import {
  arcCenter,
  arcFromStartTangentEnd,
  bounds,
  closestPoint,
  endPose,
  length,
  offset,
  poseAt,
  portPose,
  rotateGeometry,
  signedOffsetOf,
  startPose,
  translate,
} from './track';

/** TypeScript-implementasjon av `GeometryEngine`. Kan byttes med Rust/WASM uten andre endringer. */
export const geometryEngine: GeometryEngine = {
  length,
  startPose,
  endPose,
  poseAt,
  portPose,
  closestPoint,
  bounds,
  arcCenter: (g) => (g.kind === 'arc' ? arcCenter(g) : null),
  offset,
  signedOffsetOf,
  translate,
  rotate: rotateGeometry,
  arcFromStartTangentEnd: (start, heading, end) =>
    arcFromStartTangentEnd(
      start,
      heading,
      end,
      TOLERANCES.minSegmentLengthM,
      TOLERANCES.maxInteractiveRadiusM,
    ),
  snap,
  evaluateConnections,
  findCoincidentFreePorts,
  dimensionLayout,
  turnoutLayout,
  findIntersections,
};
