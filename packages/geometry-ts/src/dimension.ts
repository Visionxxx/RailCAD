import type { DimensionSpec, TrackGeometry, Vec2 } from '@railcad/domain';
import type { DimensionLayout } from '@railcad/geometry-api';
import { endPose, length, offset, poseAt } from './track';
import { dist, normalizeAngle } from './vec';

export function dimensionLayout(
  spec: DimensionSpec,
  resolveTarget: (id: string) => TrackGeometry | undefined,
): DimensionLayout | null {
  let measured: TrackGeometry;
  let a: Vec2;
  let b: Vec2;
  let valueM: number;

  if (spec.kind === 'length') {
    const target = resolveTarget(spec.targetId);
    if (!target) return null;
    measured = target;
    a = target.start;
    b = endPose(target).point;
    valueM = length(target);
  } else {
    a = spec.a;
    b = spec.b;
    valueM = dist(a, b);
    if (valueM === 0) return null;
    measured = {
      kind: 'line',
      start: a,
      headingRad: Math.atan2(b[1] - a[1], b[0] - a[0]),
      lengthM: valueM,
    };
  }

  const line = offset(measured, spec.offsetM);
  if (!line) return null;
  const lineStart = line.start;
  const lineEnd = endPose(line).point;
  const mid = poseAt(line, length(line) / 2);
  // Hold teksten lesbar: snu vinkler som ellers ville stått opp ned.
  let labelAngleRad = normalizeAngle(mid.headingRad);
  if (labelAngleRad > Math.PI / 2) labelAngleRad -= Math.PI;
  else if (labelAngleRad <= -Math.PI / 2) labelAngleRad += Math.PI;

  return {
    valueM,
    anchorA: a,
    anchorB: b,
    line,
    extensionLines: [
      [a, lineStart],
      [b, lineEnd],
    ],
    labelPoint: mid.point,
    labelAngleRad,
  };
}
