import { describe, expect, it } from 'vitest';
import { geometryEngine as e } from '../src';

const p = (over = {}) => ({
  position: [100, 50] as [number, number],
  headingRad: 0,
  ratioN: 9,
  halfLengthM: 17.223,
  ...over,
});

describe('sporkryss (diamantkryss)', () => {
  it('to rette akser gjennom M med krysningsvinkel atan(1/n)', () => {
    const l = e.crossingLayout(p());
    expect(l.segments).toHaveLength(2);
    const [a, b] = l.segments as unknown as [
      { headingRad: number; lengthM: number },
      { headingRad: number },
    ];
    expect(a.lengthM).toBeCloseTo(2 * 17.223, 12);
    expect(b.headingRad - a.headingRad).toBeCloseTo(Math.atan(1 / 9), 12);
    // begge aksene går gjennom M
    for (const seg of l.segments) {
      const c = e.closestPoint(seg, [100, 50]);
      expect(c.distanceM).toBeCloseTo(0, 9);
      expect(c.s).toBeCloseTo(17.223, 9);
    }
  });

  it('porter: slutt = akseretning, start = akseretning + π, symmetrisk om M', () => {
    const l = e.crossingLayout(p({ headingRad: 0.4 }));
    expect(l.ports.a_end.headingRad).toBeCloseTo(0.4, 12);
    expect(l.ports.a_start.headingRad).toBeCloseTo(0.4 + Math.PI, 12);
    expect(l.ports.b_end.headingRad).toBeCloseTo(0.4 + Math.atan(1 / 9), 12);
    for (const [s, en] of [
      ['a_start', 'a_end'],
      ['b_start', 'b_end'],
    ] as const) {
      const mid = [
        (l.ports[s].point[0] + l.ports[en].point[0]) / 2,
        (l.ports[s].point[1] + l.ports[en].point[1]) / 2,
      ];
      expect(mid[0]).toBeCloseTo(100, 9);
      expect(mid[1]).toBeCloseTo(50, 9);
    }
  });

  it('spor som krysser selve krysset flagges ikke mot kryssets egne akser (samme objekt), men andre spor gjør det', () => {
    const l = e.crossingLayout(p());
    const own = e.findIntersections([{ id: 'crossing-001', segments: l.segments }]);
    expect(own).toEqual([]); // kun ulike objekter sammenlignes
    const across = {
      id: 'track-001',
      segments: [
        {
          kind: 'line' as const,
          start: [106, 40] as [number, number],
          headingRad: Math.PI / 2,
          lengthM: 20,
        },
      ],
    };
    expect(
      e
        .findIntersections([{ id: 'crossing-001', segments: l.segments }, across])
        .map((x) => x.kind),
    ).toEqual(['crossing', 'crossing']);
  });
});

describe('sporkryss: spor gjennom midtpunktet', () => {
  it('et spor rett gjennom M gir ett kryssingssted (begge aksene treffes i samme punkt)', () => {
    const l = e.crossingLayout(p());
    const through = {
      id: 'track-001',
      segments: [
        {
          kind: 'line' as const,
          start: [100, 40] as [number, number],
          headingRad: Math.PI / 2,
          lengthM: 20,
        },
      ],
    };
    expect(
      e.findIntersections([{ id: 'crossing-001', segments: l.segments }, through]),
    ).toHaveLength(1);
  });
});
