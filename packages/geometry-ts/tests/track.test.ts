import { describe, expect, it } from 'vitest';
import type { ArcGeometry, LineGeometry } from '@railcad/domain';
import { geometryEngine as e } from '../src';

const EPS = 1e-9;
const line = (x: number, y: number, h: number, len: number): LineGeometry => ({
  kind: 'line',
  start: [x, y],
  headingRad: h,
  lengthM: len,
});
const arc = (x: number, y: number, h: number, r: number, sweep: number): ArcGeometry => ({
  kind: 'arc',
  start: [x, y],
  headingRad: h,
  signedRadiusM: r,
  sweepRad: sweep,
});

describe('rett spor', () => {
  it('har lengde og endepunkt fra start, retning og lengde', () => {
    const g = line(0, 0, 0, 140);
    expect(e.length(g)).toBe(140);
    expect(e.endPose(g).point[0]).toBeCloseTo(140, 12);
    expect(e.endPose(g).point[1]).toBeCloseTo(0, 12);
    const diag = line(10, 5, Math.PI / 4, 100);
    expect(e.endPose(diag).point[0]).toBeCloseTo(10 + 100 * Math.SQRT1_2, 9);
    expect(e.endPose(diag).point[1]).toBeCloseTo(5 + 100 * Math.SQRT1_2, 9);
  });

  it('finner nærmeste punkt og klemmer til endepunktene', () => {
    const g = line(0, 0, 0, 100);
    expect(e.closestPoint(g, [40, 7])).toMatchObject({ point: [40, 0], s: 40, distanceM: 7 });
    expect(e.closestPoint(g, [-5, 0]).s).toBe(0);
    expect(e.closestPoint(g, [130, 40]).point).toEqual([100, 0]);
  });

  it('gir parallellforskyvning: positiv avstand er venstre side', () => {
    const g = line(0, 0, 0, 140);
    const left = e.offset(g, 4.5) as LineGeometry;
    const right = e.offset(g, -4.5) as LineGeometry;
    expect(left.start[1]).toBeCloseTo(4.5, 12);
    expect(right.start[1]).toBeCloseTo(-4.5, 12);
    expect(left.lengthM).toBe(140);
    expect(left.headingRad).toBe(0);
    expect(e.signedOffsetOf(g, [30, -2])).toBeCloseTo(-2, 12);
  });

  it('rotasjon om et pivotpunkt og invers rotasjon gir tilbake utgangspunktet', () => {
    const g = line(10, 0, 0.3, 50);
    const pivot: [number, number] = [3, 4];
    const back = e.rotate(e.rotate(g, pivot, 1.1), pivot, -1.1) as LineGeometry;
    expect(back.start[0]).toBeCloseTo(10, 9);
    expect(back.start[1]).toBeCloseTo(0, 9);
    expect(back.headingRad).toBeCloseTo(0.3, 12);
    expect(e.rotate(line(1, 0, 0, 5), [0, 0], Math.PI / 2).start[1]).toBeCloseTo(1, 12);
  });

  it('translaterer uten å endre lengde eller retning', () => {
    const t = e.translate(line(0, 0, 0.5, 20), 3, -2) as LineGeometry;
    expect(t.start).toEqual([3, -2]);
    expect([t.headingRad, t.lengthM]).toEqual([0.5, 20]);
  });
});

describe('sirkelbue', () => {
  it('venstrekurve: sentrum til venstre, kvartsirkel gir kjent endepunkt og retning', () => {
    const g = arc(0, 0, 0, 100, Math.PI / 2);
    expect(e.arcCenter(g)).toEqual([0, 100]);
    const end = e.endPose(g);
    expect(end.point[0]).toBeCloseTo(100, 9);
    expect(end.point[1]).toBeCloseTo(100, 9);
    expect(end.headingRad).toBeCloseTo(Math.PI / 2, 12);
    expect(e.length(g)).toBeCloseTo((100 * Math.PI) / 2, 9);
  });

  it('høyrekurve speiler venstrekurven', () => {
    const g = arc(0, 0, 0, -100, Math.PI / 2);
    expect(e.arcCenter(g)).toEqual([0, -100]);
    const end = e.endPose(g);
    expect(end.point[0]).toBeCloseTo(100, 9);
    expect(end.point[1]).toBeCloseTo(-100, 9);
    expect(end.headingRad).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('starttangent er uendret når radius endres, og endepunktet følger matematikken (scenario C)', () => {
    for (const r of [50, 300, -75]) {
      const g = arc(5, 5, 0.4, r, 0.3);
      const start = e.startPose(g);
      expect(start.point).toEqual([5, 5]);
      expect(start.headingRad).toBe(0.4);
      const end = e.endPose(g);
      // Korde = 2 R sin(sweep/2), og endepunktet ligger på sirkelen rundt sentrum.
      const chord = Math.hypot(end.point[0] - 5, end.point[1] - 5);
      expect(chord).toBeCloseTo(2 * Math.abs(r) * Math.sin(0.15), 9);
      const c = e.arcCenter(g)!;
      expect(Math.hypot(end.point[0] - c[0], end.point[1] - c[1])).toBeCloseTo(Math.abs(r), 9);
      expect(end.headingRad).toBeCloseTo(0.4 + Math.sign(r) * 0.3, 12);
    }
  });

  it('finner nærmeste punkt på buen og klemmer utenfor sveipet', () => {
    const g = arc(0, 0, 0, 100, Math.PI / 2);
    const mid = e.closestPoint(g, [0, 100]);
    expect(mid.distanceM).toBeCloseTo(100, 9); // sentrum er likt langt fra alle
    const near = e.closestPoint(g, [100 * Math.sin(0.5) * 1.1, 100 - 100 * Math.cos(0.5) * 1.1]);
    expect(near.distanceM).toBeCloseTo(10, 9);
    expect(near.s).toBeCloseTo(50, 9);
    expect(e.closestPoint(g, [-30, -10]).point).toEqual([0, 0]);
  });

  it('avgrensningsboksen inkluderer kvadrantekstremer', () => {
    const b = e.bounds(arc(0, 0, 0, 100, Math.PI)); // halvsirkel opp til (0,200)
    expect(b.minX).toBeCloseTo(0, 9);
    expect(b.maxX).toBeCloseTo(100, 9);
    expect(b.maxY).toBeCloseTo(200, 9);
    expect(b.minY).toBeCloseTo(0, 9);
  });

  it('forskyver buen konsentrisk og avviser forskyvning forbi sentrum', () => {
    const g = arc(0, 0, 0, 100, 1);
    const inner = e.offset(g, 10) as ArcGeometry; // venstre = mot sentrum for venstrekurve
    expect(inner.signedRadiusM).toBe(90);
    expect(e.arcCenter(inner)![1]).toBeCloseTo(100, 9);
    expect(e.offset(g, 100)).toBeNull();
    expect(e.offset(g, 150)).toBeNull();
    expect((e.offset(arc(0, 0, 0, -100, 1), 10) as ArcGeometry).signedRadiusM).toBe(-110);
  });
});

describe('buekonstruksjon fra tangent og sluttpunkt', () => {
  it('gjenskaper kjent bue', () => {
    const g = arc(0, 0, 0, 100, 0.8);
    const end = e.endPose(g).point;
    const built = e.arcFromStartTangentEnd([0, 0], 0, end) as ArcGeometry;
    expect(built.signedRadiusM).toBeCloseTo(100, 6);
    expect(built.sweepRad).toBeCloseTo(0.8, 9);
    const right = e.arcFromStartTangentEnd([0, 0], 0, [end[0], -end[1]]) as ArcGeometry;
    expect(right.signedRadiusM).toBeCloseTo(-100, 6);
  });

  it('avviser punkter på tangentlinjen og for store radier', () => {
    expect(e.arcFromStartTangentEnd([0, 0], 0, [50, 0])).toBeNull();
    expect(e.arcFromStartTangentEnd([0, 0], 0, [1000, 1e-4])).toBeNull();
  });
});

describe('snapping', () => {
  const tracks = [
    { id: 'track-001', geometry: line(0, 0, 0, 100) },
    { id: 'track-002', geometry: arc(0, 20, 0, 50, Math.PI / 2) },
  ];
  const all = ['endpoint', 'center', 'tangent', 'nearest', 'grid'] as const;

  it('prioriterer endepunkt foran nærmeste punkt innenfor toleransen', () => {
    const r = e.snap(tracks, { cursor: [99.9, 0.05], toleranceM: 0.5, kinds: all })!;
    expect(r.kind).toBe('endpoint');
    expect(r.point).toEqual([100, 0]);
    expect(r.objectId).toBe('track-001');
  });

  it('snapper til nærmeste punkt på sporet og til buesentrum', () => {
    expect(
      e.snap(tracks, { cursor: [40, 0.3], toleranceM: 0.5, kinds: ['nearest'] }),
    ).toMatchObject({
      kind: 'nearest',
      point: [40, 0],
    });
    expect(e.snap(tracks, { cursor: [0.1, 70], toleranceM: 0.5, kinds: ['center'] })).toMatchObject(
      {
        kind: 'center',
        point: [0, 70],
      },
    );
  });

  it('gir null utenfor toleransen og respekterer av/på og ekskluderte objekter', () => {
    expect(e.snap(tracks, { cursor: [50, 5], toleranceM: 0.5, kinds: all })).toBeNull();
    expect(e.snap(tracks, { cursor: [100, 0], toleranceM: 0.5, kinds: ['nearest'] })!.kind).toBe(
      'nearest',
    );
    expect(e.snap(tracks, { cursor: [100, 0], toleranceM: 0.5, kinds: ['center'] })).toBeNull();
    expect(
      e.snap(tracks, {
        cursor: [100, 0],
        toleranceM: 0.5,
        kinds: ['endpoint'],
        excludeIds: new Set(['track-001']),
      }),
    ).toBeNull();
  });

  it('snapper til rutenett og til tangentpunkt fra referansepunkt', () => {
    expect(
      e.snap([], { cursor: [10.2, 4.9], toleranceM: 0.5, kinds: ['grid'], gridStepM: 5 })!.point,
    ).toEqual([10, 5]);
    const circle = [{ id: 'c', geometry: arc(0, 0, 0, 10, Math.PI * 1.9) }];
    // Fra (20,10) mot sirkel (sentrum (0,10), r=10): tangentpunkt (10,10)+... verifiser tangentegenskapen.
    const ref: [number, number] = [20, 10];
    const cand = e.snap(circle, {
      cursor: [6.0, 18.0],
      toleranceM: 3,
      kinds: ['tangent'],
      reference: ref,
    });
    expect(cand?.kind).toBe('tangent');
    const t = cand!.point;
    const radial = [t[0] - 0, t[1] - 10];
    const toRef = [ref[0] - t[0], ref[1] - t[1]];
    expect(radial[0] * toRef[0] + radial[1] * toRef[1]).toBeCloseTo(0, 6);
  });
});

describe('målsetting', () => {
  const target = line(0, 0, 0, 140);
  const resolve = (id: string) => (id === 'track-001' ? target : undefined);

  it('lengdemål beregnes fra sporets geometri og følger endringer', () => {
    const spec = { kind: 'length', targetId: 'track-001', offsetM: 3 } as const;
    expect(e.dimensionLayout(spec, resolve)!.valueM).toBe(140);
    const longer = { ...target, lengthM: 150 };
    expect(e.dimensionLayout(spec, () => longer)!.valueM).toBe(150);
    expect(e.dimensionLayout(spec, () => undefined)).toBeNull();
  });

  it('frie mål gir avstand, målelinje på riktig side og lesbar tekstvinkel', () => {
    const l = e.dimensionLayout({ kind: 'distance', a: [0, 0], b: [3, 4], offsetM: 1 }, resolve)!;
    expect(l.valueM).toBeCloseTo(5, 12);
    expect(l.line.start[0]).toBeCloseTo(-0.8, 12); // venstre for retning (3,4) er (-0.8, 0.6)
    expect(l.line.start[1]).toBeCloseTo(0.6, 12);
    const back = e.dimensionLayout(
      { kind: 'distance', a: [3, 4], b: [0, 0], offsetM: 1 },
      resolve,
    )!;
    expect(Math.abs(back.labelAngleRad)).toBeLessThanOrEqual(Math.PI / 2 + EPS);
    expect(
      e.dimensionLayout({ kind: 'distance', a: [1, 1], b: [1, 1], offsetM: 1 }, resolve),
    ).toBeNull();
  });
});
