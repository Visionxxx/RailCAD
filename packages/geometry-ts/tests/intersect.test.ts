import { describe, expect, it } from 'vitest';
import { getTurnoutType, type TrackGeometry } from '@railcad/domain';
import { geometryEngine as e } from '../src';

const line = (x: number, y: number, h: number, len: number): TrackGeometry => ({
  kind: 'line',
  start: [x, y],
  headingRad: h,
  lengthM: len,
});
const arc = (x: number, y: number, h: number, r: number, sweep: number): TrackGeometry => ({
  kind: 'arc',
  start: [x, y],
  headingRad: h,
  signedRadiusM: r,
  sweepRad: sweep,
});
const item = (id: string, ...segments: TrackGeometry[]) => ({ id, segments });
const deg = (r: number) => (r * 180) / Math.PI;

describe('kryssdeteksjon – linjer', () => {
  it('to rette spor som krysser: ett «crossing» med riktig punkt og vinkel', () => {
    const r = e.findIntersections([
      item('b', line(-10, 0, 0, 20)),
      item('a', line(0, -10, Math.PI / 2, 20)),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ a: 'a', b: 'b', kind: 'crossing' }); // ID-ene sortert
    expect(r[0]!.point[0]).toBeCloseTo(0, 9);
    expect(r[0]!.point[1]).toBeCloseTo(0, 9);
    expect(deg(r[0]!.angleRad)).toBeCloseTo(90, 9);
  });

  it('krysningsvinkelen er den spisse vinkelen uavhengig av retning (1:9 ≈ 6,34°)', () => {
    const a = Math.atan(1 / 9);
    const r = e.findIntersections([
      item('a', line(-50, 0, 0, 100)),
      item('b', line(50, 4, Math.PI + a, 100)),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.angleRad).toBeCloseTo(a, 9);
  });

  it('T-forbindelse: ende på en annen akse gir «touch» med riktig objekt', () => {
    const r = e.findIntersections([
      item('main', line(0, 0, 0, 10)),
      item('stikk', line(5, 0, Math.PI / 2, 5)),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'touch', endOf: 'stikk' });
  });

  it('ende mot ende (mulig kobling) og parallelle spor gir ingen treff', () => {
    expect(
      e.findIntersections([item('a', line(0, 0, 0, 10)), item('b', line(10, 0, 0.3, 10))]),
    ).toEqual([]);
    expect(
      e.findIntersections([item('a', line(0, 0, 0, 100)), item('b', line(0, 4.5, 0, 100))]),
    ).toEqual([]);
    expect(
      e.findIntersections([item('a', line(0, 0, 0, 10)), item('b', line(0, 5, 0.01, 8))]),
    ).toEqual([]); // bommer
  });

  it('spor som ligger oppå hverandre gir «overlap» med lengde', () => {
    const r = e.findIntersections([item('a', line(0, 0, 0, 10)), item('b', line(5, 0, 0, 10))]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'overlap' });
    expect(r[0]!.overlapM).toBeCloseTo(5, 9);
    // samme linje, motsatt retning
    const back = e.findIntersections([
      item('a', line(0, 0, 0, 10)),
      item('b', line(15, 0, Math.PI, 10)),
    ]);
    expect(back[0]!.overlapM).toBeCloseTo(5, 9);
  });
});

describe('kryssdeteksjon – buer', () => {
  // Halvsirkel mot venstre fra (0,0): sentrum (0,10), r = 10, dekker x ≥ 0.
  const half = arc(0, 0, 0, 10, Math.PI);

  it('rett spor gjennom en bue gir to krysninger; utenfor buens sveip gir ingen', () => {
    const r = e.findIntersections([item('arc', half), item('l', line(5, -5, Math.PI / 2, 30))]);
    expect(r.map((x) => x.kind)).toEqual(['crossing', 'crossing']);
    const ys = r.map((x) => x.point[1]).sort((p, q) => p - q);
    expect(ys[0]).toBeCloseTo(10 - Math.sqrt(75), 6);
    expect(ys[1]).toBeCloseTo(10 + Math.sqrt(75), 6);
    expect(
      e.findIntersections([item('arc', half), item('l', line(-5, -5, Math.PI / 2, 30))]),
    ).toEqual([]);
  });

  it('tangerende rett spor gir ett treff med vinkel 0', () => {
    const r = e.findIntersections([item('arc', half), item('l', line(10, -5, Math.PI / 2, 30))]);
    expect(r).toHaveLength(1);
    expect(r[0]!.angleRad).toBeCloseTo(0, 6);
  });

  it('to buer som krysser, og buer på samme sirkel som overlapper', () => {
    const a = arc(0, 0, 0, 10, Math.PI);
    const b = arc(10, 10, Math.PI / 2, 10, Math.PI); // sentrum (0,10) sin venstre kant … annen sirkel
    const r = e.findIntersections([item('a', a), item('b', arc(5, 3, 0.5, -12, 2))]);
    expect(r.every((x) => x.kind === 'crossing' || x.kind === 'touch')).toBe(true);
    void b;
    const same = e.findIntersections([item('a', half), item('b', arc(0, 20, 0, -10, Math.PI / 2))]); // høyrekurve fra toppen (0,20) nedover høyre side – samme sirkel
    expect(same).toHaveLength(1);
    expect(same[0]).toMatchObject({ kind: 'overlap' });
    expect(same[0]!.overlapM).toBeCloseTo((10 * Math.PI) / 2, 6);
  });

  it('buer som bare deler endepunkt (koblede) gir ingen treff', () => {
    const a = arc(0, 0, 0, 100, 0.2);
    const end = e.endPose(a);
    const b = arc(end.point[0], end.point[1], end.headingRad, -100, 0.2); // S-kurve
    expect(e.findIntersections([item('a', a), item('b', b)])).toEqual([]);
  });
});

describe('kryssdeteksjon – sporveksler og skala', () => {
  const type = getTurnoutType('trv-60E1-1:9-R300-EVF')!;
  const layout = e.turnoutLayout(type, {
    catalogId: type.catalogId,
    catalogRevision: 'r',
    position: [0, 0],
    headingRad: 0,
    hand: 'left',
  });

  it('spor som krysser vekselens stamspor flagges; spor koblet i SS og i bakkant flagges ikke', () => {
    const turnout = item('turnout-001', ...layout.segments);
    const across = item('track-009', line(10, -5, Math.PI / 2, 10));
    // Et loddrett spor på tvers krysser både stamsporet og avviksbuen.
    expect(e.findIntersections([turnout, across]).map((x) => x.kind)).toEqual([
      'crossing',
      'crossing',
    ]);
    const before = item('track-001', line(-20, 0, 0, 20)); // slutter i SS
    const after = item('track-002', line(type.mainDimensionsMm.L / 1000, 0, 0, 20)); // starter i stamspor ut
    expect(e.findIntersections([turnout, before, after])).toEqual([]);
  });

  it('kryss i vekselens avviksbue finnes også', () => {
    const turnout = item('turnout-001', ...layout.segments);
    const mid = e.poseAt(layout.segments[1]!, e.length(layout.segments[1]!) / 2).point;
    const across = item('track-009', line(mid[0], mid[1] - 5, Math.PI / 2, 10));
    expect(e.findIntersections([turnout, across]).some((x) => x.kind === 'crossing')).toBe(true);
  });

  it('3000 parallelle spor håndteres raskt og gir ingen treff', () => {
    const many = Array.from({ length: 3000 }, (_, i) =>
      item(`t-${String(i).padStart(4, '0')}`, line(0, i * 5, 0, 500)),
    );
    const t0 = performance.now();
    expect(e.findIntersections(many)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
