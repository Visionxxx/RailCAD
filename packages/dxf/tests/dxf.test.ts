import { describe, expect, it } from 'vitest';
import { loadProject, type RailProject } from '@railcad/domain';
import { geometryEngine as engine } from '@railcad/geometry-ts';
import { buildEntities, exportDxf, LAYERS } from '../src';
import { asciiText } from '../src/write';
import sporfelt from '../../../fixtures/demo-sporfelt.json';
import verksted from '../../../fixtures/demo-verksted.json';

/** Leser DXF som liste av (gruppekode, verdi). */
function pairs(text: string): Array<[number, string]> {
  const lines = text.split(/\r?\n/);
  const out: Array<[number, string]> = [];
  for (let i = 0; i + 1 < lines.length; i += 2)
    out.push([Number(lines[i]), (lines[i + 1] ?? '').trim()]);
  return out;
}
/** Entitetsliste: type + kodene som tilhører den. */
function entityBlocks(text: string) {
  const p = pairs(text);
  const start = p.findIndex(
    ([c, v], i) => c === 2 && v === 'ENTITIES' && p[i - 1]?.[1] === 'SECTION',
  );
  const blocks: Array<{ type: string; codes: Array<[number, string]> }> = [];
  for (let i = start + 1; i < p.length; i++) {
    const [c, v] = p[i]!;
    if (c === 0 && v === 'ENDSEC') break;
    if (c === 0) blocks.push({ type: v, codes: [] });
    else blocks.at(-1)?.codes.push([c, v]);
  }
  return blocks;
}
const code = (b: { codes: Array<[number, string]> }, c: number) =>
  Number(b.codes.find(([k]) => k === c)?.[1]);

const project = (objects: RailProject['objects']): RailProject => ({
  schemaVersion: '0.1.0',
  project: { id: 'p', name: 'Prøve æøå', units: 'm', coordinateSystem: { type: 'local_xy' } },
  objects,
  connections: [],
});

describe('DXF-entiteter', () => {
  const left = {
    kind: 'arc',
    start: [10, 5],
    headingRad: 0.3,
    signedRadiusM: 120,
    sweepRad: 0.8,
  } as const;
  const right = {
    kind: 'arc',
    start: [10, 5],
    headingRad: 0.3,
    signedRadiusM: -120,
    sweepRad: 0.8,
  } as const;
  const p = project([
    {
      id: 'track-001',
      type: 'track_segment',
      geometry: { kind: 'line', start: [0, 0], headingRad: 0, lengthM: 140 },
    },
    { id: 'track-002', type: 'track_segment', geometry: left },
    { id: 'track-003', type: 'track_segment', geometry: right },
  ]);
  const ents = buildEntities(p, engine);

  it('rett spor blir LINE på sporaksen', () => {
    expect(ents[0]).toMatchObject({ kind: 'line', layer: LAYERS.track.name, a: [0, 0] });
    expect((ents[0] as unknown as { b: number[] }).b[0]).toBeCloseTo(140, 9);
  });

  it.each([
    ['venstrekurve', 1, left],
    ['høyrekurve (CCW-bue med byttede ender)', 2, right],
  ] as const)('%s: ARC-vinklene gir spor-endepunktene', (_n, idx, g) => {
    const a = ents[idx] as Extract<(typeof ents)[number], { kind: 'arc' }>;
    expect(a.radius).toBeCloseTo(120, 9);
    const at = (deg: number) => [
      a.center[0] + a.radius * Math.cos((deg * Math.PI) / 180),
      a.center[1] + a.radius * Math.sin((deg * Math.PI) / 180),
    ];
    const trackEnd = engine.endPose(g).point;
    const [first, last] = [at(a.startDeg), at(a.endDeg)];
    const [from, to] = g.signedRadiusM > 0 ? [g.start, trackEnd] : [trackEnd, g.start];
    expect(first[0]).toBeCloseTo(from[0], 6);
    expect(first[1]).toBeCloseTo(from[1], 6);
    expect(last[0]).toBeCloseTo(to[0], 6);
    expect(last[1]).toBeCloseTo(to[1], 6);
    // CCW-sveip fra start- til sluttvinkel er buens sveip
    const sweep = ((a.endDeg - a.startDeg + 360) % 360) * (Math.PI / 180);
    expect(sweep).toBeCloseTo(0.8, 9);
  });

  it('legger inn forbeholdstekst om at planen ikke er regelverkskontrollert', () => {
    const last = ents.at(-1)!;
    expect(last.kind === 'text' && last.value).toContain('ikke regelverkskontrollert');
  });
});

describe('DXF-filer', () => {
  const load = (d: unknown) => {
    const r = loadProject(d);
    if (!r.ok) throw new Error(r.errors.join());
    return r.project;
  };

  it('R12: gyldig oppbygning, ASCII, lag og entitetstall stemmer med modellen', () => {
    const p = load(sporfelt);
    const text = exportDxf(p, engine, 'R12');
    expect([...text].every((ch) => ch.charCodeAt(0) < 128)).toBe(true);
    const pr = pairs(text);
    expect(pr.find(([c]) => c === 1)?.[1]).toBe('AC1009');
    expect(pr.at(-1)).toEqual([0, 'EOF']);
    const layers = pr
      .filter(([c, v], i) => c === 2 && pr[i - 1]?.[1] === 'LAYER' && v !== 'LAYER')
      .map(([, v]) => v);
    expect(layers.sort()).toEqual(
      Object.values(LAYERS)
        .map((l) => l.name)
        .sort(),
    );

    const blocks = entityBlocks(text);
    const expected = buildEntities(p, engine);
    expect(blocks).toHaveLength(expected.length);
    for (const kind of ['line', 'arc', 'text'] as const) {
      expect(blocks.filter((b) => b.type === kind.toUpperCase())).toHaveLength(
        expected.filter((e) => e.kind === kind).length,
      );
    }
    const numbers = blocks.flatMap((b) =>
      b.codes.filter(([c]) => [10, 20, 11, 21, 40, 50, 51].includes(c)).map(([, v]) => Number(v)),
    );
    expect(numbers.every(Number.isFinite)).toBe(true);
    // 8 veksler à stamspor + bue (D mangler) på vekselagets
    const onTurnout = blocks.filter((b) =>
      b.codes.some(([c, v]) => c === 8 && v === LAYERS.turnout.name),
    );
    expect(onTurnout).toHaveLength(16);
  });

  it('R2007: AC1021, meter som enhet, alle lag og entiteter', () => {
    const p = load(verksted);
    const text = exportDxf(p, engine, 'R2007');
    const pr = pairs(text);
    expect(pr.some(([c, v]) => c === 1 && v === 'AC1021')).toBe(true);
    const i = pr.findIndex(([, v]) => v === '$INSUNITS');
    expect(pr[i + 1]).toEqual([70, '6']);
    for (const l of Object.values(LAYERS)) expect(text).toContain(l.name);
    const blocks = entityBlocks(text);
    const expected = buildEntities(p, engine);
    expect(blocks.filter((b) => b.type === 'LINE')).toHaveLength(
      expected.filter((e) => e.kind === 'line').length,
    );
    expect(blocks.filter((b) => b.type === 'ARC')).toHaveLength(
      expected.filter((e) => e.kind === 'arc').length,
    );
    expect(blocks.filter((b) => b.type === 'TEXT')).toHaveLength(
      expected.filter((e) => e.kind === 'text').length,
    );
    const arc = blocks.find((b) => b.type === 'ARC')!;
    expect(code(arc, 40)).toBeCloseTo(300, 9);
  });

  it('tekst: R12 transkriberer norske tegn, R2007 beholder dem (UTF-8)', () => {
    expect(asciiText('Sporavstand ø å æ ° – ok')).toBe('Sporavstand o aa ae  deg - ok');
    const p = load(verksted);
    const text = exportDxf(
      { ...p, project: { ...p.project, name: 'Kjøreveg Ålesund' } },
      engine,
      'R2007',
    );
    expect(text).toContain('Kjøreveg Ålesund');
  });
});

describe('DXF-eksport av sporkryss', () => {
  it('skriver begge aksene på eget lag og en «ikke verifisert»-tekst', () => {
    const p = project([
      {
        id: 'crossing-001',
        type: 'crossing',
        crossing: { position: [100, 50], headingRad: 0, ratioN: 9, halfLengthM: 17 },
      },
    ]);
    const ents = buildEntities(p, engine);
    const onLayer = ents.filter((e) => e.layer === LAYERS.crossing.name);
    expect(onLayer).toHaveLength(2);
    expect(onLayer.every((e) => e.kind === 'line')).toBe(true);
    const text = ents.find((e) => e.kind === 'text' && e.value.includes('sporkryss'));
    expect(text && text.kind === 'text' && text.value).toContain('ikke verifisert');
    expect(exportDxf(p, engine, 'R12')).toContain('RAILCAD_SPORKRYSS');
  });
});

describe('DXF-eksport: prosjektlag', () => {
  it('objekter på egne lag får lagnavn «<typelag>_<NAVN>» og lagene deklareres', () => {
    const p = {
      ...project([
        {
          id: 'track-001',
          type: 'track_segment',
          layerId: 'lag-001',
          geometry: { kind: 'line', start: [0, 0], headingRad: 0, lengthM: 10 },
        },
        {
          id: 'track-002',
          type: 'track_segment',
          geometry: { kind: 'line', start: [0, 5], headingRad: 0, lengthM: 10 },
        },
      ] as any),
      layers: [
        { id: 'standard', name: 'Standard', visible: true, locked: false },
        { id: 'lag-001', name: 'Østre verksted', visible: true, locked: false },
      ],
    };
    const ents = buildEntities(p, engine);
    expect(ents[0]).toMatchObject({ layer: 'RAILCAD_SPORAKSE_OSTRE_VERKSTED' });
    expect(ents[1]).toMatchObject({ layer: 'RAILCAD_SPORAKSE' });
    for (const v of ['R12', 'R2007'] as const) {
      const text = exportDxf(p, engine, v);
      expect(text).toContain('RAILCAD_SPORAKSE_OSTRE_VERKSTED');
    }
  });
});
