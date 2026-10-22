import { describe, expect, it } from 'vitest';
import {
  definitionFromCustom,
  findTurnoutDefinition,
  turnoutPortsFor,
  type CustomTurnoutType,
  type TurnoutPlacement,
} from '@railcad/domain';
import { geometryEngine as e } from '../src';

const at = (hand: 'left' | 'right' = 'left'): TurnoutPlacement => ({
  catalogId: 'x',
  catalogRevision: '',
  position: [0, 0],
  headingRad: 0,
  hand,
});

const base = {
  name: 'Test',
  inputMode: 'geometry' as const,
};
const simple: CustomTurnoutType = {
  ...base,
  id: 'egen-enkel',
  stemLengthM: 30,
  branches: [{ hand: 'left', ratioN: 9, radiusM: 190, straightM: 5 }],
};
const symmetric: CustomTurnoutType = {
  ...base,
  id: 'egen-sym',
  stemLengthM: null,
  branches: [
    { hand: 'left', ratioN: 9, radiusM: 190, straightM: 0 },
    { hand: 'right', ratioN: 9, radiusM: 190, straightM: 0 },
  ],
};
const threeWay: CustomTurnoutType = {
  ...base,
  id: 'egen-tre',
  stemLengthM: 30,
  branches: [
    { hand: 'left', ratioN: 9, radiusM: 190, straightM: 0 },
    { hand: 'right', ratioN: 9, radiusM: 190, straightM: 0 },
  ],
};

describe('egendefinerte veksler – geometri', () => {
  it('enkel veksel: stamspor, bue og rett parti; porter stem_in/out + diverging_out', () => {
    const def = definitionFromCustom(simple);
    const l = e.turnoutLayout(def, at());
    expect(turnoutPortsFor(def)).toEqual(['stem_in', 'stem_out', 'diverging_out']);
    expect(l.segments).toHaveLength(3);
    expect(l.routes.map((r) => r.port)).toEqual(['stem_out', 'diverging_out']);
    expect(l.ports.stem_out!.point[0]).toBeCloseTo(30, 9);
    const alpha = Math.atan(1 / 9);
    expect(l.ports.diverging_out!.headingRad).toBeCloseTo(alpha, 9);
    const arcEnd = 190 * Math.sin(alpha);
    expect(l.ports.diverging_out!.point[0]).toBeCloseTo(arcEnd + 5 * Math.cos(alpha), 9);
  });

  it('symmetrisk veksel uten stamspor: to grener speilvendt om x-aksen, ingen stem_out', () => {
    const def = definitionFromCustom(symmetric);
    const l = e.turnoutLayout(def, at());
    expect(turnoutPortsFor(def)).toEqual(['stem_in', 'diverging_out', 'diverging2_out']);
    expect(l.ports.stem_out).toBeUndefined();
    const a = l.ports.diverging_out!;
    const b = l.ports.diverging2_out!;
    expect(a.point[0]).toBeCloseTo(b.point[0], 9);
    expect(a.point[1]).toBeCloseTo(-b.point[1], 9);
    expect(a.headingRad).toBeCloseTo(-b.headingRad, 9);
  });

  it('tresporsveksel: stamspor og to grener, hver gren har sin rute', () => {
    const def = definitionFromCustom(threeWay);
    const l = e.turnoutLayout(def, at());
    expect(l.segments).toHaveLength(3);
    expect(l.routes.map((r) => r.port)).toEqual(['stem_out', 'diverging_out', 'diverging2_out']);
    expect(l.ports.diverging_out!.point[1]).toBeGreaterThan(0);
    expect(l.ports.diverging2_out!.point[1]).toBeLessThan(0);
  });

  it('speiling (hand=right) bytter side på alle grener', () => {
    const def = definitionFromCustom(threeWay);
    const l = e.turnoutLayout(def, at());
    const r = e.turnoutLayout(def, at('right'));
    expect(r.ports.diverging_out!.point[1]).toBeCloseTo(l.ports.diverging2_out!.point[1], 9);
  });

  it('registeret: findTurnoutDefinition gir stabil identitet og finner katalog og egne typer', () => {
    expect(findTurnoutDefinition('egen-enkel', [simple])).toBe(
      findTurnoutDefinition('egen-enkel', [simple]),
    );
    expect(findTurnoutDefinition('egen-enkel', [])).toBeUndefined();
    expect(findTurnoutDefinition('trv-54E3-1:9-R190-kort')?.origin).toBe('catalog');
    expect(findTurnoutDefinition('egen-enkel', [simple])?.verificationLabel).toMatch(
      /ikke verifisert/i,
    );
  });

  it('høyde: ruter fordeler koten lineært fra stem_in til hver utgående port', async () => {
    const { turnoutSegmentElevations } = await import('../src/elevation');
    const l = e.turnoutLayout(definitionFromCustom(threeWay), at());
    const z = turnoutSegmentElevations(l.segments, l.routes, {
      stem_in: 10,
      stem_out: 11,
      diverging_out: 12,
      diverging2_out: 9,
    });
    expect(z[0]).toEqual({ zStart: 10, zEnd: 11 });
    expect(z[1]!.zEnd).toBeCloseTo(12, 9);
    expect(z[2]!.zEnd).toBeCloseTo(9, 9);
  });
});
