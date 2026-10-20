import { describe, expect, it } from 'vitest';
import { fmt, fmtDeg, parseNumber } from '../src/format';
import { fitBounds, gridSteps, panBy, screenToWorld, visibleWorldRect, worldToScreen, zoomAt, type ViewState } from '../src/rendering/viewport';
import { pickObject } from '../src/tools/pick';
import type { RailObject } from '@railcad/domain';

const view: ViewState = { cx: 100, cy: -20, scale: 8, width: 1000, height: 600 };

describe('viewport', () => {
  it('world↔screen er hverandres inverse og har Y opp', () => {
    const p = worldToScreen(view, [130, 10]);
    const back = screenToWorld(view, p);
    expect(back[0]).toBeCloseTo(130, 10);
    expect(back[1]).toBeCloseTo(10, 10);
    expect(worldToScreen(view, [100, -20])).toEqual([500, 300]);
    expect(worldToScreen(view, [100, -10])[1]).toBeLessThan(300); // høyere Y = høyere opp på skjermen
  });

  it('zoom beholder verdenspunktet under markøren og klemmer skalaen', () => {
    const before = screenToWorld(view, [320, 140]);
    const z = zoomAt(view, 320, 140, 3.7);
    const after = screenToWorld(z, [320, 140]);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
    expect(zoomAt(view, 0, 0, 1e9).scale).toBeLessThanOrEqual(5000);
    expect(zoomAt(view, 0, 0, 1e-9).scale).toBeGreaterThanOrEqual(0.02);
  });

  it('panorering flytter verden med musebevegelsen', () => {
    const p = panBy(view, 50, -30);
    expect(worldToScreen(p, [100, -20])).toEqual([550, 270]);
  });

  it('tilpass visning rammer inn avgrensningsboksen', () => {
    const f = fitBounds(view, { minX: 0, minY: 0, maxX: 140, maxY: 10 });
    const r = visibleWorldRect(f);
    expect(r.minX).toBeLessThan(0);
    expect(r.maxX).toBeGreaterThan(140);
    expect(f.cx).toBe(70);
    expect(fitBounds(view, null).scale).toBe(10);
  });

  it('rutenettet velger 1-2-5-steg med minst 14 px mellom linjer', () => {
    for (const scale of [0.05, 0.7, 3, 10, 77, 1200]) {
      const g = gridSteps(scale);
      expect(g.minor * scale).toBeGreaterThanOrEqual(14 - 1e-9);
      expect(g.major).toBeGreaterThan(g.minor);
      expect([1, 2, 5]).toContain(+(g.minor / 10 ** Math.floor(Math.log10(g.minor))).toFixed(6));
    }
  });
});

describe('format og tallinput', () => {
  it('leser komma og punktum som desimaltegn og avviser ugyldig input', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber(' 1 234.5 ')).toBe(1234.5);
    expect(parseNumber('-0,25')).toBe(-0.25);
    for (const bad of ['', 'abc', '1,2,3', 'Infinity', '--1', '1e999']) expect(parseNumber(bad)).toBeNull();
  });
  it('formaterer med norsk desimaltegn og unngår -0', () => {
    expect(fmt(140)).toBe('140,000');
    expect(fmt(-0.0000001)).toBe('0,000');
    expect(fmtDeg(Math.PI / 2, 1)).toBe('90,0°');
  });
});

describe('objektvalg', () => {
  const objs: RailObject[] = [
    { id: 'a', type: 'track_segment', geometry: { kind: 'line', start: [0, 0], headingRad: 0, lengthM: 100 } },
    { id: 'b', type: 'track_segment', geometry: { kind: 'line', start: [0, 5], headingRad: 0, lengthM: 100 } },
  ];
  const byId = new Map(objs.map((o) => [o.id, o] as const));
  it('velger nærmeste objekt innenfor toleransen og ellers ingenting', () => {
    expect(pickObject(objs, byId, [50, 0.4], 1)?.id).toBe('a');
    expect(pickObject(objs, byId, [50, 4.2], 1)?.id).toBe('b');
    expect(pickObject(objs, byId, [50, 2.5], 1)).toBeNull();
    expect(pickObject(objs, byId, [50, 0.4], 1, (o) => o.id === 'b')).toBeNull();
  });
});
