import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  deriveFromDimensions,
  getTurnoutType,
  mergeLibrary,
  parseLibrary,
  serializeLibrary,
  validateCustomTurnout,
  validateProject,
  type CrossingPreset,
  type CustomTurnoutType,
  type RailProject,
} from '../src';

const simple: CustomTurnoutType = {
  id: 'egen-001',
  name: 'Min veksel',
  stemLengthM: 30,
  inputMode: 'geometry',
  branches: [{ hand: 'left', ratioN: 9, radiusM: 190, straightM: 5 }],
};
const preset: CrossingPreset = { id: 'kryss-1', name: 'Kryss 1:9', ratioN: 9, halfLengthM: 17 };

const withTurnout = (custom: CustomTurnoutType[], catalogId: string, port = 'stem_in') => {
  const p: RailProject = {
    ...createEmptyProject(),
    customTurnouts: custom,
    objects: [
      {
        id: 'v-1',
        type: 'turnout',
        turnout: {
          catalogId,
          catalogRevision: 'r',
          position: [0, 0],
          headingRad: 0,
          hand: 'left',
        },
      },
      {
        id: 'track-001',
        type: 'track_segment',
        geometry: { kind: 'line', start: [-10, 0], headingRad: 0, lengthM: 10 },
      },
    ],
    connections: [
      { a: { objectId: 'track-001', port: 'end' }, b: { objectId: 'v-1', port } as never },
    ],
  };
  return validateProject(p);
};

describe('validateCustomTurnout', () => {
  it('godtar en gyldig enkel veksel', () => {
    expect(validateCustomTurnout(simple)).toEqual([]);
  });
  it('avviser ugyldig mål og manglende stamspor med én gren', () => {
    expect(validateCustomTurnout({ ...simple, name: ' ' })).not.toEqual([]);
    expect(
      validateCustomTurnout({
        ...simple,
        branches: [{ hand: 'left', ratioN: 0.5, radiusM: -1, straightM: -2 }],
      }).length,
    ).toBeGreaterThanOrEqual(3);
    expect(validateCustomTurnout({ ...simple, stemLengthM: null })[0]).toMatch(/to grener/);
  });
  it('avviser to identiske grener', () => {
    const b = simple.branches[0]!;
    expect(validateCustomTurnout({ ...simple, branches: [b, { ...b }] })[0]).toMatch(/identiske/);
  });
});

describe('deriveFromDimensions', () => {
  it('gir samme radius og stamlengde som TRV-tabellen for en katalogtype', () => {
    const t = getTurnoutType('trv-54E3-1:9-R190-kort')!;
    const m = t.mainDimensionsMm;
    const d = deriveFromDimensions({
      ratioN: t.ratioN,
      A: m.A,
      B: m.B,
      C: m.C,
      D: m.D ?? 0,
      L: m.L,
    });
    expect(d.radiusM).toBeCloseTo(t.radiusM, 0);
    expect(d.stemLengthM).toBeCloseTo(m.L / 1000, 9);
    expect(d.warnings).toEqual([]);
  });
  it('varsler når målene ikke henger sammen', () => {
    const d = deriveFromDimensions({ ratioN: 9, A: 10000, C: 12000, B: 12000, L: 30000 });
    expect(d.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe('prosjekt med egne veksler', () => {
  it('godtar objekter som viser til egen type og porter etter typen', () => {
    expect(withTurnout([simple], 'egen-001').ok).toBe(true);
  });
  it('avviser ukjent type og port som typen ikke har', () => {
    expect(withTurnout([], 'egen-001').ok).toBe(false);
    const sym: CustomTurnoutType = {
      id: 'egen-sym',
      name: 'Sym',
      stemLengthM: null,
      inputMode: 'geometry',
      branches: [
        { hand: 'left', ratioN: 9, radiusM: 190, straightM: 0 },
        { hand: 'right', ratioN: 9, radiusM: 190, straightM: 0 },
      ],
    };
    expect(withTurnout([sym], 'egen-sym', 'diverging2_out').ok).toBe(true);
    const r = withTurnout([sym], 'egen-sym', 'stem_out');
    expect(r.ok).toBe(false);
    expect(withTurnout([simple], 'egen-001', 'diverging2_out').ok).toBe(false);
  });
  it('avviser duplikat-ID og ugyldig ID', () => {
    const p: RailProject = { ...createEmptyProject(), customTurnouts: [simple, simple] };
    expect(validateProject(p).ok).toBe(false);
    // Katalog-ID-er inneholder «:», som egne ID-er ikke kan – så de kan aldri kollidere.
    const q: RailProject = {
      ...createEmptyProject(),
      customTurnouts: [{ ...simple, id: 'trv-54E3-1:9-R190-kort' }],
    };
    expect(validateProject(q).ok).toBe(false);
  });
  it('validerer forhåndsinnstillinger (tangentlengde på kryssveksel)', () => {
    const bad: CrossingPreset = { ...preset, slip: { arcs: 'both', radiusM: 5000 } };
    expect(validateProject({ ...createEmptyProject(), crossingPresets: [bad] }).ok).toBe(false);
    expect(validateProject({ ...createEmptyProject(), crossingPresets: [preset] }).ok).toBe(true);
  });
});

describe('bibliotekfil', () => {
  it('rundtur: serialiser og les tilbake', () => {
    const r = parseLibrary(serializeLibrary([simple], [preset]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.library.turnouts).toEqual([simple]);
      expect(r.library.crossingPresets).toEqual([preset]);
    }
  });
  it('avviser ugyldig JSON, prosjektfil og ugyldig innhold', () => {
    expect(parseLibrary('{').ok).toBe(false);
    expect(parseLibrary(JSON.stringify(createEmptyProject())).ok).toBe(false);
    const bad = serializeLibrary([{ ...simple, branches: [] }], []);
    const r = parseLibrary(bad);
    expect(r.ok).toBe(false);
  });
  it('sammenslåing: identiske hoppes over, ID-konflikt gir ny ID uten å røre eksisterende', () => {
    const lib = (t: CustomTurnoutType[], p: CrossingPreset[] = []) => {
      const r = parseLibrary(serializeLibrary(t, p));
      if (!r.ok) throw new Error('ugyldig');
      return r.library;
    };
    const same = mergeLibrary([simple], [], lib([simple]));
    expect(same.added).toBe(0);
    expect(same.skipped).toBe(1);
    const other = { ...simple, name: 'Annen' };
    const m = mergeLibrary([simple], [], lib([other]));
    expect(m.renamed).toEqual([{ from: 'egen-001', to: 'egen-001-2' }]);
    expect(m.turnouts.map((t) => t.id)).toEqual(['egen-001', 'egen-001-2']);
    expect(m.turnouts[0]).toBe(simple);
  });
});
