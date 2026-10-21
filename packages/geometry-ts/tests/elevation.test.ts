import { describe, expect, it } from 'vitest';
import { getTurnoutType, type Connection } from '@railcad/domain';
import {
  crossingSegmentElevations,
  elevationNear,
  geometryEngine as e,
  gradePermille,
  lerpElevation,
  portClusters,
  resolveElevations,
  turnoutSegmentElevations,
} from '../src';

const conn = (a: string, ap: 'start' | 'end', b: string, bp: 'start' | 'end'): Connection => ({
  a: { objectId: a, port: ap },
  b: { objectId: b, port: bp },
});

describe('høydemodell', () => {
  it('lineær kote og stigning i promille; ukjent kote gir null', () => {
    expect(lerpElevation(100, 102, 50, 100)).toBeCloseTo(101, 12);
    expect(lerpElevation(100, 102, 150, 100)).toBe(102); // klemmes
    expect(lerpElevation(undefined, 102, 10, 100)).toBeNull();
    expect(gradePermille(100, 102, 100)).toBeCloseTo(20, 12);
    expect(gradePermille(102, 100, 100)).toBeCloseTo(-20, 12);
    expect(gradePermille(100, undefined, 100)).toBeNull();
  });

  it('tilkoblede porter deler kote (også gjennom kjeder), og konflikter rapporteres', () => {
    const conns = [conn('a', 'end', 'b', 'start'), conn('b', 'start', 'c', 'start')];
    expect(new Set(portClusters(conns).values()).size).toBe(1);
    const ok = resolveElevations({ 'a:end': 105 }, conns);
    expect(ok.effective.get('b:start')).toBe(105);
    expect(ok.effective.get('c:start')).toBe(105);
    expect(ok.conflicts).toEqual([]);
    const bad = resolveElevations({ 'a:end': 105, 'b:start': 106 }, conns);
    expect(bad.conflicts).toHaveLength(1);
    expect(bad.conflicts[0]!.values.sort()).toEqual([105, 106]);
    expect(resolveElevations({ 'x:start': 1 }, []).effective.get('x:start')).toBe(1);
  });

  it('veksel: stamspor lineært mellom sine porter, avviket fordelt langs buen og det rette partiet', () => {
    const type = getTurnoutType('trv-54E3-1:9-R190-kort')!; // bue + rett parti D
    const layout = e.turnoutLayout(type, {
      catalogId: type.catalogId,
      catalogRevision: 'r',
      position: [0, 0],
      headingRad: 0,
      hand: 'left',
    });
    const z = turnoutSegmentElevations(type, layout.segments, {
      stemIn: 100,
      stemOut: 101,
      divergingOut: 100.5,
    });
    expect(z).toHaveLength(3);
    expect(z[0]).toEqual({ zStart: 100, zEnd: 101 });
    expect(z[1]!.zStart).toBe(100);
    expect(z[2]!.zEnd).toBeCloseTo(100.5, 12);
    expect(z[1]!.zEnd).toBeCloseTo(z[2]!.zStart!, 12); // sammenhengende langs avviket
    // kote nær stamsporets midte
    expect(elevationNear(layout.segments, z, [type.mainDimensionsMm.L / 2000, 0])).toBeCloseTo(
      100.5,
      6,
    );
  });

  it('sporkryss: hver akse har sin egen stigning', () => {
    const l = e.crossingLayout({ position: [0, 0], headingRad: 0, ratioN: 9, halfLengthM: 10 });
    const z = crossingSegmentElevations(
      { position: [0, 0], headingRad: 0, ratioN: 9, halfLengthM: 10 },
      l.segments,
      { aStart: 0, aEnd: 2, bStart: 5, bEnd: 5 },
    );
    expect(elevationNear(l.segments, z, [0, 0])).not.toBeNull();
    expect(elevationNear([l.segments[0]!], [z[0]!], [0, 0])).toBeCloseTo(1, 9); // midt på A
    expect(elevationNear([l.segments[1]!], [z[1]!], [0, 0])).toBeCloseTo(5, 9);
  });
});
