import { describe, expect, it } from 'vitest';
import {
  definitionFromCustom,
  findTurnoutDefinition,
  type CustomTurnoutType,
  type TurnoutPlacement,
} from '@railcad/domain';
import {
  BLADE_LEN_M,
  PANEL_SPLIT_M,
  firstCrossing,
  turnoutParts,
} from '../src/rendering/turnout-parts';
import { GAUGE_M, SLEEPER_SPACING, sleepersAlong } from '../src/rendering/scene3d';

const at = (hand: 'left' | 'right' = 'left', x = 0, y = 0, h = 0): TurnoutPlacement => ({
  catalogId: 'x',
  catalogRevision: '',
  position: [x, y],
  headingRad: h,
  hand,
});
const noZ = () => null;
const kinds = (s: { kind: string }[]) => s.map((p) => p.kind).sort();

describe('vekselmekanikk i 3D (illustrativ)', () => {
  const def = findTurnoutDefinition('trv-60E1-1:9-R300-EVF')!;

  it('enkel veksel: to tunger, ett hjerte, to ledeskinner, stillverk og to stagstenger', () => {
    const { strips } = turnoutParts('v', def, at(), noZ);
    expect(kinds(strips)).toEqual(
      ['blade', 'blade', 'check', 'check', 'frog', 'machine', 'stretcher', 'stretcher'].sort(),
    );
  });

  it('hjertet ligger etter tungene og der grenens indre skinne krysser stamsporets skinne', () => {
    const { strips } = turnoutParts('v', def, at(), noZ);
    const frog = strips.find((s) => s.kind === 'frog')!;
    const mid = frog.points.reduce((a, p) => ({ x: a.x + p.x / 2, y: a.y + p.y / 2 }), {
      x: 0,
      y: 0,
    });
    expect(mid.x).toBeGreaterThan(BLADE_LEN_M);
    expect(mid.y).toBeCloseTo(GAUGE_M / 2, 1); // på stamsporets venstre skinne (grenen går mot venstre)
  });

  it('venstre/høyre og rotasjon: hjertet speiles om stamaksen og følger plasseringen', () => {
    const l = turnoutParts('v', def, at('left'), noZ).strips.find((s) => s.kind === 'frog')!;
    const r = turnoutParts('v', def, at('right'), noZ).strips.find((s) => s.kind === 'frog')!;
    expect(r.points[0]!.y).toBeCloseTo(-l.points[0]!.y, 6);
    const moved = turnoutParts('v', def, at('left', 100, 50, Math.PI / 2), noZ).strips.find(
      (s) => s.kind === 'frog',
    )!;
    expect(moved.points[0]!.x).toBeCloseTo(100 - l.points[0]!.y, 6);
    expect(moved.points[0]!.y).toBeCloseTo(50 + l.points[0]!.x, 6);
  });

  it('svillefeltet har jevn avstand, vokser i lengde og deles når sporene er langt fra hverandre', () => {
    const { sleepers } = turnoutParts('v', def, at(), noZ);
    const panel = sleepers.filter((s) => Math.abs(s.headingRad) < 1e-9 && s.lengthM > 2.7);
    expect(panel.length).toBeGreaterThan(10);
    for (let i = 1; i < panel.length; i++) {
      expect(panel[i]!.x - panel[i - 1]!.x).toBeCloseTo(SLEEPER_SPACING, 6);
      expect(panel[i]!.lengthM).toBeGreaterThanOrEqual(panel[i - 1]!.lengthM - 1e-9);
    }
    // Sporavstand ved siste svelle i feltet ≈ innenfor delingsgrensen (svellelengde = avstand + 2·(sporvidde/2+0,55)).
    const last = panel.at(-1)!;
    expect(last.lengthM - (GAUGE_M + 1.1)).toBeLessThanOrEqual(PANEL_SPLIT_M + 0.7);
  });

  it('symmetrisk veksel uten stamspor: ett hjerte, ingen stillverk', () => {
    const sym: CustomTurnoutType = {
      id: 'egen-sym',
      name: 'Sym',
      stemLengthM: null,
      inputMode: 'geometry',
      branches: [
        { hand: 'left', ratioN: 9, radiusM: 300, straightM: 0 },
        { hand: 'right', ratioN: 9, radiusM: 300, straightM: 0 },
      ],
    };
    const { strips } = turnoutParts('v', definitionFromCustom(sym), at(), noZ);
    expect(strips.filter((s) => s.kind === 'frog')).toHaveLength(1);
    expect(strips.some((s) => s.kind === 'machine')).toBe(false);
  });

  it('kote fra zAt følger med til delene', () => {
    const { strips, sleepers } = turnoutParts('v', def, at(), () => 12.5);
    expect(strips[0]!.points.every((p) => p.z === 12.5)).toBe(true);
    expect(sleepers.every((s) => s.z === 12.5)).toBe(true);
  });
});

describe('hjelpefunksjoner', () => {
  it('firstCrossing finner skjæringspunkt og null når linjene ikke krysser', () => {
    const a = [
      { x: 0, y: 0, h: 0 },
      { x: 10, y: 0, h: 0 },
    ];
    const b = [
      { x: 5, y: -1, h: 0 },
      { x: 5, y: 1, h: 0 },
    ];
    expect(firstCrossing(a, b)).toMatchObject({ x: 5, y: 0 });
    expect(
      firstCrossing(a, [
        { x: 0, y: 1, h: 0 },
        { x: 10, y: 1, h: 0 },
      ]),
    ).toBeNull();
  });
  it('sleepersAlong gir jevn avstand og interpolerer kote', () => {
    const pts = [
      { x: 0, y: 0, z: 0, headingRad: 0 },
      { x: 6, y: 0, z: 6, headingRad: 0 },
    ];
    const s = sleepersAlong('a', pts);
    expect(s).toHaveLength(10);
    expect(s[1]!.x - s[0]!.x).toBeCloseTo(SLEEPER_SPACING, 9);
    expect(s[0]!.z).toBeCloseTo(0.3, 9);
  });
});
