import { describe, expect, it } from 'vitest';
import type { Connection, TrackGeometry } from '@railcad/domain';
import type { Pose } from '@railcad/geometry-api';
import { geometryEngine as e } from '../src';

const line = (x: number, y: number, h: number, len: number): TrackGeometry => ({
  kind: 'line',
  start: [x, y],
  headingRad: h,
  lengthM: len,
});
/** Portkart (`<id>:<port>` → utgående pose) for et sett spor. */
const tracks = (o: Record<string, TrackGeometry>) => {
  const m = new Map<string, Pose>();
  for (const [id, g] of Object.entries(o)) {
    m.set(`${id}:start`, e.portPose(g, 'start'));
    m.set(`${id}:end`, e.portPose(g, 'end'));
  }
  return m;
};
const conn = (a: string, ap: 'start' | 'end', b: string, bp: 'start' | 'end'): Connection => ({
  a: { objectId: a, port: ap },
  b: { objectId: b, port: bp },
});

describe('porter', () => {
  it('utgående retning: slutt = retning, start = retning + π', () => {
    const g = line(0, 0, 0.5, 10);
    expect(e.portPose(g, 'end').headingRad).toBeCloseTo(0.5, 12);
    expect(e.portPose(g, 'start').headingRad).toBeCloseTo(0.5 + Math.PI, 12);
    expect(e.portPose(g, 'start').point).toEqual([0, 0]);
  });
});

describe('koblingskontroll', () => {
  it('slutt→start i forlengelse er ok, også for bue som fortsetter fra rett spor', () => {
    const a = line(0, 0, 0, 20);
    const arc = e.arcFromStartTangentEnd([20, 0], 0, [30, 10])!;
    const r = e.evaluateConnections(tracks({ a, b: arc }), [conn('a', 'end', 'b', 'start')]);
    expect(r[0]).toMatchObject({ status: 'ok' });
    expect(r[0]!.distanceM).toBe(0);
  });

  it('slutt↔slutt med motsatt retning er ok (to spor som møtes)', () => {
    const r = e.evaluateConnections(tracks({ a: line(0, 0, 0, 10), b: line(20, 0, Math.PI, 10) }), [
      conn('a', 'end', 'b', 'end'),
    ]);
    expect(r[0]!.status).toBe('ok');
  });

  it('rapporterer posisjonsavvik med avstand – uten å flytte noe', () => {
    const r = e.evaluateConnections(tracks({ a: line(0, 0, 0, 10), b: line(10.25, 0, 0, 10) }), [
      conn('a', 'end', 'b', 'start'),
    ]);
    expect(r[0]).toMatchObject({ status: 'position' });
    expect(r[0]!.distanceM).toBeCloseTo(0.25, 12);
  });

  it('rapporterer tangentavvik når endepunktene møtes med knekk', () => {
    const r = e.evaluateConnections(tracks({ a: line(0, 0, 0, 10), b: line(10, 0, 0.1, 10) }), [
      conn('a', 'end', 'b', 'start'),
    ]);
    expect(r[0]!.status).toBe('tangent');
    expect(r[0]!.tangentDeviationRad).toBeCloseTo(0.1, 12);
  });

  it('rapporterer manglende spor og flere koblinger samtidig', () => {
    const r = e.evaluateConnections(tracks({ a: line(0, 0, 0, 10) }), [
      conn('a', 'end', 'zzz', 'start'),
      conn('a', 'start', 'a', 'end'),
    ]);
    expect(r.map((x) => x.status)).toEqual(['missing', 'position']);
    expect(r[0]!.at).toBeNull();
  });
});

describe('forslag til koblinger', () => {
  it('finner sammenfallende ukoblede endepunkter og hopper over koblede', () => {
    const t = tracks({
      a: line(0, 0, 0, 10),
      b: line(10, 0, 0, 10),
      c: line(20, 0, 0, 10),
      far: line(100, 100, 0, 5),
    });
    const all = e.findCoincidentFreePorts(t, []);
    expect(all).toHaveLength(2);
    expect(
      all.map((p) => `${p.a.objectId}.${p.a.port}-${p.b.objectId}.${p.b.port}`).sort(),
    ).toEqual(['a.end-b.start', 'b.end-c.start']);
    const some = e.findCoincidentFreePorts(t, [conn('a', 'end', 'b', 'start')]);
    expect(some).toHaveLength(1);
    expect(some[0]!.a.objectId).toBe('b');
  });

  it('ignorerer endepunkter på samme spor', () => {
    const loop = tracks({
      a: { kind: 'arc', start: [0, 0], headingRad: 0, signedRadiusM: 10, sweepRad: 6.2831853 },
    });
    expect(e.findCoincidentFreePorts(loop, [])).toEqual([]);
  });
});
