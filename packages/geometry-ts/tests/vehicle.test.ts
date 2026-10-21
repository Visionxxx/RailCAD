import { describe, expect, it } from 'vitest';
import type { TrackGeometry } from '@railcad/domain';
import { curveSwing, vehicleCheck, type VehicleDims } from '../src';

const v: VehicleDims = { lengthM: 20, bogieCentreM: 14, widthM: 3, marginM: 0.2 };
const line = (y: number, len = 50): TrackGeometry => ({
  kind: 'line',
  start: [0, y],
  headingRad: 0,
  lengthM: len,
});

describe('utsving i kurve', () => {
  it('stemmer med formelen: δi = R − √(R² − (B/2)²), δo = √((B/2+O)² + R² − (B/2)²) − R', () => {
    const R = 300;
    const s = curveSwing(R, v)!;
    expect(s.innerM).toBeCloseTo(R - Math.sqrt(R * R - 49), 12);
    expect(s.outerM).toBeCloseTo(Math.sqrt(10 ** 2 + R * R - 49) - R, 12);
    // Kjent tilnærming for store R: δi ≈ (B/2)²/(2R), δo ≈ ((B/2+O)² − (B/2)²)/(2R)
    expect(s.innerM).toBeCloseTo(49 / (2 * R), 3);
    expect(s.outerM).toBeCloseTo((100 - 49) / (2 * R), 3);
  });
  it('rett spor gir 0, og for liten radius gir null', () => {
    expect(curveSwing(Infinity, v)).toEqual({ innerM: 0, outerM: 0 });
    expect(curveSwing(7, v)).toBeNull();
    expect(curveSwing(6, v)).toBeNull();
  });
  it('utsvinget øker når radius avtar', () => {
    expect(curveSwing(150, v)!.outerM).toBeGreaterThan(curveSwing(300, v)!.outerM);
  });
});

describe('kjøretøykontroll av spor', () => {
  it('parallelle rette spor: avstand mot nødvendig (bredde + 2·klaring)', () => {
    const r = vehicleCheck(
      [
        { id: 'a', segments: [line(0)] },
        { id: 'b', segments: [line(3.5)] }, // < 3 + 0,4 = 3,4? nei, 3,5 ≥ 3,4
        { id: 'c', segments: [line(7)] },
        { id: 'd', segments: [line(10.2)] },
      ],
      v,
    );
    const row = (a: string, b: string) => r.spacing.find((s) => s.a === a && s.b === b)!;
    expect(row('a', 'b').requiredM).toBeCloseTo(3.4, 12);
    expect(row('a', 'b').status).toBe('ok');
    expect(row('b', 'c').distanceM).toBeCloseTo(3.5, 9);
    const tight = vehicleCheck(
      [
        { id: 'a', segments: [line(0)] },
        { id: 'b', segments: [line(3.3)] },
      ],
      v,
    );
    expect(tight.spacing[0]!.status).toBe('tight');
  });

  it('tilkoblede/kryssende spor (avstand < 1 m) og fjerne spor (> 15 m) hoppes over', () => {
    const r = vehicleCheck(
      [
        { id: 'a', segments: [line(0)] },
        { id: 'b', segments: [line(0.5)] },
        { id: 'c', segments: [line(40)] },
      ],
      v,
    );
    expect(r.spacing).toHaveLength(0);
  });

  it('kurve: utsving legges til på riktig side (innover/utover) i nødvendig avstand', () => {
    const R = 200;
    const arc: TrackGeometry = {
      kind: 'arc',
      start: [0, 0],
      headingRad: 0,
      signedRadiusM: R,
      sweepRad: 0.1,
    };
    // Rett spor på venstre side (innersiden av venstrekurven) og på høyre side (yttersiden).
    const inner = vehicleCheck(
      [
        { id: 'k', segments: [arc] },
        { id: 'l', segments: [line(4, 10)] },
      ],
      v,
    );
    const sw = curveSwing(R, v)!;
    expect(inner.spacing).toHaveLength(1);
    expect(inner.spacing[0]!.requiredM).toBeCloseTo(3.4 + sw.innerM, 9);
    const outer = vehicleCheck(
      [
        { id: 'k', segments: [arc] },
        { id: 'l', segments: [line(-4, 10)] },
      ],
      v,
    );
    expect(outer.spacing[0]!.requiredM).toBeCloseTo(3.4 + sw.outerM, 9);
  });

  it('radius som er for liten for kjøretøyet rapporteres, og kurver listes', () => {
    const small: TrackGeometry = {
      kind: 'arc',
      start: [0, 0],
      headingRad: 0,
      signedRadiusM: 6,
      sweepRad: 1,
    };
    const ok: TrackGeometry = {
      kind: 'arc',
      start: [0, 0],
      headingRad: 0,
      signedRadiusM: 300,
      sweepRad: 0.1,
    };
    const r = vehicleCheck(
      [
        { id: 'x', segments: [small] },
        { id: 'y', segments: [ok] },
      ],
      v,
    );
    expect(r.tooTight).toEqual(['x']);
    expect(r.curves.map((c) => c.id)).toEqual(['y']);
  });
});
