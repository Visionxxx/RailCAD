import { describe, expect, it } from 'vitest';
import type { RailObject } from '@railcad/domain';
import { GAUGE_M, collectPolylines, railPoint } from '../src/rendering/scene3d';

const track: RailObject = {
  id: 'track-001',
  type: 'track_segment',
  geometry: { kind: 'line', start: [0, 0], headingRad: 0, lengthM: 10 },
};

describe('3D-punktrekker', () => {
  it('interpolerer kote lineært langs aksen', () => {
    const [l] = collectPolylines([track], (o) => ({
      segments: [(o as typeof track).geometry],
      z: [{ zStart: 0, zEnd: 1 }],
    }));
    expect(l!.points[0]!.z).toBe(0);
    expect(l!.points.at(-1)!.z).toBeCloseTo(1, 9);
    expect(l!.points).toHaveLength(6); // 10 m / 2 m + 1
  });
  it('ukjent kote gir null, og objekter uten geometri hoppes over', () => {
    const [l] = collectPolylines([track], (o) => ({
      segments: [(o as typeof track).geometry],
      z: [{ zStart: null, zEnd: null }],
    }));
    expect(l!.points.every((p) => p.z === null)).toBe(true);
    const dim: RailObject = {
      id: 'dim-001',
      type: 'dimension',
      dimension: { kind: 'length', targetId: 'track-001', offsetM: 1 },
    };
    expect(collectPolylines([dim], () => null)).toEqual([]);
  });
  it('skinnene ligger ±halv sporvidde vinkelrett på retningen', () => {
    const p = { x: 5, y: 2, headingRad: 0 };
    expect(railPoint(p, 1).y).toBeCloseTo(2 + GAUGE_M / 2, 12);
    expect(railPoint(p, -1).y).toBeCloseTo(2 - GAUGE_M / 2, 12);
    const q = { x: 0, y: 0, headingRad: Math.PI / 2 }; // retning +Y: venstre er −X
    expect(railPoint(q, 1).x).toBeCloseTo(-GAUGE_M / 2, 12);
    const d = Math.hypot(
      railPoint(q, 1).x - railPoint(q, -1).x,
      railPoint(q, 1).y - railPoint(q, -1).y,
    );
    expect(d).toBeCloseTo(GAUGE_M, 12);
  });
});
