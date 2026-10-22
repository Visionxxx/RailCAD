import { describe, expect, it } from 'vitest';
import {
  backgroundMatrix,
  backgroundToWorld,
  backgroundWorldCorners,
  metersPerDxfUnit,
  scaleAboutPoint,
  translatePlacement,
  validatePrims,
  validateProject,
  worldToBackground,
  type BackgroundPlacement,
  type DxfBackground,
  type RailProject,
} from '../src';

const pl = (over: Partial<BackgroundPlacement> = {}): BackgroundPlacement => ({
  origin: [100, 50],
  scaleMPerUnit: 0.5,
  rotationRad: Math.PI / 6,
  scaleConfirmed: true,
  ...over,
});

describe('bakgrunnstransformasjon', () => {
  it('innhold → verden og tilbake er hverandres inverse', () => {
    const p = pl();
    for (const c of [
      [0, 0],
      [10, 20],
      [-7.5, 3],
    ] as const) {
      const back = worldToBackground(p, backgroundToWorld(p, c));
      expect(back[0]).toBeCloseTo(c[0], 9);
      expect(back[1]).toBeCloseTo(c[1], 9);
    }
    expect(backgroundToWorld(p, [0, 0])).toEqual([100, 50]);
  });

  it('SVG-matrisen gir samme punkt som backgroundToWorld', () => {
    const p = pl();
    const [a, b, c, d, e, f] = backgroundMatrix(p);
    const w = backgroundToWorld(p, [12, -4]);
    expect(a * 12 + c * -4 + e).toBeCloseTo(w[0], 9);
    expect(b * 12 + d * -4 + f).toBeCloseTo(w[1], 9);
  });

  it('skalering om et punkt lar punktet stå og skalerer avstander med faktoren', () => {
    const p = pl({ rotationRad: 0 });
    const fixed: [number, number] = [130, 80];
    const contentPoint = worldToBackground(p, fixed);
    const scaled = scaleAboutPoint({ ...p, scaleConfirmed: false }, fixed, 2.5);
    expect(scaled.scaleMPerUnit).toBeCloseTo(1.25, 12);
    expect(scaled.scaleConfirmed).toBe(true);
    const still = backgroundToWorld(scaled, contentPoint);
    expect(still[0]).toBeCloseTo(fixed[0], 9);
    expect(still[1]).toBeCloseTo(fixed[1], 9);
    const a = backgroundToWorld(p, [0, 0]);
    const b = backgroundToWorld(p, [10, 0]);
    const a2 = backgroundToWorld(scaled, [0, 0]);
    const b2 = backgroundToWorld(scaled, [10, 0]);
    expect(Math.hypot(b2[0] - a2[0], b2[1] - a2[1])).toBeCloseTo(
      2.5 * Math.hypot(b[0] - a[0], b[1] - a[1]),
      9,
    );
  });

  it('flytting og enhetsfaktorer', () => {
    expect(translatePlacement(pl(), 5, -3).origin).toEqual([105, 47]);
    expect([4, 5, 6, 7, 1, 2].map((u) => metersPerDxfUnit(u))).toEqual([
      0.001, 0.01, 1, 1000, 0.0254, 0.3048,
    ]);
    expect(metersPerDxfUnit(0)).toBeNull();
    expect(metersPerDxfUnit(undefined)).toBeNull();
  });

  it('hjørnene i verden følger plassering og rotasjon', () => {
    const bg: DxfBackground = {
      kind: 'dxf',
      id: 'bg-001',
      name: 'x',
      visible: true,
      opacity: 1,
      placement: pl({ rotationRad: Math.PI / 2, scaleMPerUnit: 1, origin: [0, 0] }),
      layers: [{ name: '0', color: 7 }],
      prims: [],
      sourceUnits: 'meters',
      extents: { minX: 0, minY: 0, maxX: 10, maxY: 4 },
    };
    const c = backgroundWorldCorners(bg);
    expect(c[1]![0]).toBeCloseTo(0, 9);
    expect(c[1]![1]).toBeCloseTo(10, 9); // (10,0) roteres 90° til (0,10)
  });
});

describe('validering av bakgrunner', () => {
  const dxf = (over: Record<string, unknown> = {}) => ({
    kind: 'dxf',
    id: 'bg-001',
    name: 'kart',
    visible: true,
    opacity: 0.8,
    placement: pl(),
    layers: [{ name: '0', color: 7 }],
    sourceUnits: 'meters',
    extents: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    prims: [
      ['L', 0, 0, 0, 10, 10],
      ['A', 0, 5, 5, 3, 0, 90],
      ['C', 0, 1, 1, 2],
      ['P', 0, 1, [0, 0, 0, 5, 0, 0.4, 5, 5, 0]],
      ['T', 0, 1, 1, 2, 0, 'tekst'],
    ],
    ...over,
  });
  const project = (backgrounds: unknown[]): unknown =>
    ({
      schemaVersion: '0.1.0',
      project: { id: 'p', name: 'p', units: 'm', coordinateSystem: { type: 'local_xy' } },
      objects: [],
      connections: [],
      backgrounds,
    }) satisfies Omit<RailProject, 'backgrounds'> & { backgrounds: unknown[] };

  it('godtar DXF- og bildebakgrunner, og filer uten bakgrunner', () => {
    expect(validateProject(project([dxf()])).ok).toBe(true);
    const img = {
      kind: 'image',
      source: 'pdf',
      id: 'bg-002',
      name: 'p',
      visible: true,
      opacity: 0.5,
      placement: pl(),
      dataUrl: 'data:image/png;base64,AAAA',
      widthPx: 100,
      heightPx: 50,
    };
    expect(validateProject(project([dxf(), img])).ok).toBe(true);
    const without = { ...(project([]) as Record<string, unknown>) };
    delete without.backgrounds;
    expect(validateProject(without).ok).toBe(true);
  });

  it.each([
    ['skala 0', dxf({ placement: pl({ scaleMPerUnit: 0 }) }), 'skala'],
    ['dekkevne > 1', dxf({ opacity: 2 }), 'dekkevne'],
    ['ukjent primitiv', dxf({ prims: [['X', 0]] }), 'ukjent primitiv'],
    ['NaN i linje', dxf({ prims: [['L', 0, 0, 0, null, 1]] }), 'ugyldig linje'],
    ['lag-indeks utenfor', dxf({ prims: [['L', 5, 0, 0, 1, 1]] }), 'lag-indeks'],
    ['polylinje med for få punkter', dxf({ prims: [['P', 0, 0, [0, 0, 0]]] }), 'ugyldig polylinje'],
    ['bue med radius 0', dxf({ prims: [['A', 0, 0, 0, 0, 0, 90]] }), 'ugyldig bue'],
    ['duplisert ID', null, 'duplikat'],
  ])('avviser: %s', (_n, bg, needle) => {
    const list = bg === null ? [dxf(), dxf()] : [bg];
    const r = validateProject(project(list));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain(needle);
  });

  it('avviser bilde som ikke er PNG/JPEG-data-URL', () => {
    const img = {
      kind: 'image',
      source: 'image',
      id: 'bg-1',
      name: 'x',
      visible: true,
      opacity: 1,
      placement: pl(),
      dataUrl: 'https://eksempel.no/x.png',
      widthPx: 10,
      heightPx: 10,
    };
    expect(validateProject(project([img])).ok).toBe(false);
  });

  it('validatePrims er uavhengig av zod og meldingen peker på riktig indeks', () => {
    expect(
      validatePrims(
        [
          ['L', 0, 0, 0, 1, 1],
          ['C', 0, 0, 0, -1],
        ],
        1,
      ),
    ).toBe('prims[1]: ugyldig sirkel');
  });
});
