import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanMText, readDxfBackground } from '../src';

const sample = (f: string) =>
  readFileSync(new URL(`../../../fixtures/dxf/${f}`, import.meta.url), 'utf8');
const ok = (text: string) => {
  const r = readDxfBackground(text);
  if (!r.ok) throw new Error(r.error);
  return r.result;
};
const dxf = (...pairs: Array<[number, string | number]>) =>
  pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n0\nEOF\n';

describe('lesing av DXF som bakgrunn – testfilene', () => {
  it('lokal R2007: leser alle entitetstyper, lag og meter som enhet', () => {
    const r = ok(sample('kartunderlag-lokal-r2007.dxf'));
    expect(r.prims).toHaveLength(10 + 7 + 34 + 2 + 6);
    expect(r.summary.read).toMatchObject({ LWPOLYLINE: 10, LINE: 7, CIRCLE: 34, ARC: 2, TEXT: 6 });
    expect(r.summary.skipped).toEqual({});
    expect(r.layers.map((l) => l.name)).toEqual(
      expect.arrayContaining(['EIENDOM', 'BYGG', 'VEG', 'SPOR_EKSISTERENDE', 'MAST', 'TEKST']),
    );
    expect(r.insunits).toBe(6);
    expect(r.metersPerUnit).toBe(1);
    expect(r.offset[0]).toBeCloseTo(0, 6);
    expect(r.extents.maxX).toBeCloseTo(985, 0);
  });

  it('bulge blir bevart på polylinjer', () => {
    const r = ok(sample('kartunderlag-lokal-r2007.dxf'));
    const property = r.prims.find(
      (p) => p[0] === 'P' && p[3].length === 21 && p[3].some((v, i) => i % 3 === 2 && v === 0.4142),
    );
    expect(property).toBeTruthy();
  });

  it('R12: leser LINE/ARC/TEXT uten enhetsangivelse (ukjent enhet)', () => {
    const r = ok(sample('kartunderlag-lokal-r12.dxf'));
    expect(r.summary.read).toMatchObject({ LINE: 44, ARC: 75, TEXT: 6 });
    expect(r.insunits).toBeUndefined();
    expect(r.metersPerUnit).toBeNull();
  });

  it('UTM-fil: store koordinater normaliseres til små innholdskoordinater med forskyvning', () => {
    const r = ok(sample('kartunderlag-utm-r2007.dxf'));
    expect(r.offset[0]).toBeCloseTo(262000, 3);
    expect(r.offset[1]).toBeGreaterThan(6.6e6);
    expect(r.extents.maxX).toBeLessThan(1500);
    const local = ok(sample('kartunderlag-lokal-r2007.dxf'));
    expect(r.extents.maxX).toBeCloseTo(local.extents.maxX, 3);
    expect(r.extents.maxY).toBeCloseTo(local.extents.maxY, 3);
  });

  it('millimeter-fil: enhetsfaktor 0,001 og koordinater ×1000', () => {
    const r = ok(sample('kartunderlag-mm-r2007.dxf'));
    expect(r.metersPerUnit).toBe(0.001);
    expect(r.unitName).toBe('millimeters');
    const local = ok(sample('kartunderlag-lokal-r2007.dxf'));
    expect(r.extents.maxX).toBeCloseTo(local.extents.maxX * 1000, 0);
  });

  it('RailCAD-eksporten kan leses tilbake (R12 og R2007)', () => {
    for (const f of ['railcad-lodalen-r12.dxf', 'railcad-lodalen-r2007.dxf']) {
      const r = ok(sample(f));
      expect(r.summary.read).toMatchObject({ LINE: 39, ARC: 17, TEXT: 13 });
    }
  });
});

describe('lesing av DXF – blokker og spesialtilfeller', () => {
  const header = (units?: number) =>
    [
      [0, 'SECTION'],
      [2, 'HEADER'],
      ...(units === undefined
        ? []
        : ([
            [9, '$INSUNITS'],
            [70, units],
          ] as Array<[number, string | number]>)),
      [0, 'ENDSEC'],
    ] as Array<[number, string | number]>;

  it('INSERT: blokk flyttes, roteres og skaleres rundt basepunktet', () => {
    const text = dxf(
      ...header(6),
      [0, 'SECTION'],
      [2, 'BLOCKS'],
      [0, 'BLOCK'],
      [8, '0'],
      [2, 'B'],
      [70, 0],
      [10, 1],
      [20, 1],
      [30, 0],
      [0, 'LINE'],
      [8, '0'],
      [10, 1],
      [20, 1],
      [30, 0],
      [11, 3],
      [21, 1],
      [31, 0],
      [0, 'ENDBLK'],
      [8, '0'],
      [0, 'ENDSEC'],
      [0, 'SECTION'],
      [2, 'ENTITIES'],
      [0, 'INSERT'],
      [8, '0'],
      [2, 'B'],
      [10, 100],
      [20, 50],
      [30, 0],
      [41, 2],
      [42, 2],
      [50, 90],
      [0, 'ENDSEC'],
    );
    const r = ok(text);
    expect(r.summary.read).toMatchObject({ LINE: 1, INSERT: 1 });
    // Linje (1,1)→(3,1) med basepunkt (1,1): lokalt (0,0)→(2,0); ×2 → (0,0)→(4,0); rotert 90° → (0,0)→(0,4); + (100,50)
    const [, , x1, y1, x2, y2] = r.prims[0] as readonly [
      'L',
      number,
      number,
      number,
      number,
      number,
    ];
    const [ox, oy] = r.offset;
    expect([x1 + ox, y1 + oy, x2 + ox, y2 + oy].map((v) => +v.toFixed(6))).toEqual([
      100, 50, 100, 54,
    ]);
  });

  it('rapporterer ikke-støttede entiteter og tom fil med klar feilmelding', () => {
    const withHatch = dxf(
      ...header(),
      [0, 'SECTION'],
      [2, 'ENTITIES'],
      [0, 'LINE'],
      [8, '0'],
      [10, 0],
      [20, 0],
      [30, 0],
      [11, 1],
      [21, 0],
      [31, 0],
      [0, 'SOLID'],
      [8, '0'],
      [10, 0],
      [20, 0],
      [30, 0],
      [11, 1],
      [21, 0],
      [31, 0],
      [12, 0],
      [22, 1],
      [32, 0],
      [13, 1],
      [23, 1],
      [33, 0],
      [0, 'ENDSEC'],
    );
    const r = ok(withHatch);
    expect(r.summary.skipped).toEqual({ SOLID: 1 });
    const empty = readDxfBackground(
      dxf(...header(), [0, 'SECTION'], [2, 'ENTITIES'], [0, 'ENDSEC']),
    );
    expect(empty.ok).toBe(false);
    expect(readDxfBackground('dette er ikke dxf').ok).toBe(false);
  });

  it('MTEXT: formateringskoder fjernes', () => {
    expect(cleanMText('{\\fArial|b0;Hall \\P1}\\U+00E6')).toBe('Hall 1æ');
  });
});

describe('lesing av DXF – robusthet', () => {
  const entities = (...pairs: Array<[number, string | number]>) =>
    dxf([0, 'SECTION'], [2, 'ENTITIES'], ...pairs, [0, 'ENDSEC']);
  const block = (name: string, ...inner: Array<[number, string | number]>) =>
    [
      [0, 'BLOCK'],
      [8, '0'],
      [2, name],
      [70, 0],
      [10, 0],
      [20, 0],
      [30, 0],
      ...inner,
      [0, 'ENDBLK'],
      [8, '0'],
    ] as Array<[number, string | number]>;
  const insert = (name: string): Array<[number, string | number]> => [
    [0, 'INSERT'],
    [8, '0'],
    [2, name],
    [10, 0],
    [20, 0],
    [30, 0],
  ];

  it('en ødelagt entitet hoppes over og rapporteres – resten leses', () => {
    const r = ok(
      entities(
        [0, 'LINE'],
        [8, '0'],
        [10, 0],
        [20, 0],
        [30, 0],
        [11, 5],
        [21, 0],
        [31, 0],
        [0, 'LINE'],
        [8, '0'],
        [10, 0],
        [20, 0],
        [30, 0], // mangler sluttpunkt
        [0, 'MTEXT'],
        [8, '0'],
        [1, 'uten posisjon'],
      ),
    );
    expect(r.prims).toHaveLength(1);
    expect(r.summary.skipped).toMatchObject({ 'LINE (ugyldig)': 1 });
  });

  it('nøstede blokker (DXF-bombe) avbrytes med klar feilmelding i stedet for å fryse', () => {
    const lines: Array<[number, string | number]> = [];
    for (let i = 0; i < 30; i++)
      lines.push([0, 'LINE'], [8, '0'], [10, i], [20, 0], [30, 0], [11, i], [21, 1], [31, 0]);
    const text = dxf(
      [0, 'SECTION'],
      [2, 'BLOCKS'],
      ...block('A', ...lines),
      ...block('B', ...Array.from({ length: 30 }, () => insert('A')).flat()),
      ...block('C', ...Array.from({ length: 30 }, () => insert('B')).flat()),
      ...block('D', ...Array.from({ length: 30 }, () => insert('C')).flat()),
      [0, 'ENDSEC'],
      [0, 'SECTION'],
      [2, 'ENTITIES'],
      ...insert('D'),
      [0, 'ENDSEC'],
    );
    const t0 = Date.now();
    const r = readDxfBackground(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('for kompleks');
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('enorm matrise-INSERT (rader × kolonner) avbrytes', () => {
    const text = dxf(
      [0, 'SECTION'],
      [2, 'BLOCKS'],
      ...block('A', [0, 'LINE'], [8, '0'], [10, 0], [20, 0], [30, 0], [11, 1], [21, 0], [31, 0]),
      [0, 'ENDSEC'],
      [0, 'SECTION'],
      [2, 'ENTITIES'],
      ...insert('A'),
      [70, 100000],
      [71, 100000],
      [44, 1],
      [45, 1],
      [0, 'ENDSEC'],
    );
    expect(readDxfBackground(text).ok).toBe(false);
  });

  it('speilet bue (ekstrusjon 0,0,-1) speiles om y-aksen', () => {
    const r = ok(
      entities(
        [0, 'ARC'],
        [8, '0'],
        [10, 5],
        [20, 0],
        [30, 0],
        [40, 10],
        [50, 0],
        [51, 90],
        [210, 0],
        [220, 0],
        [230, -1],
        [0, 'LINE'],
        [8, '0'],
        [10, -20],
        [20, 0],
        [30, 0],
        [11, 20],
        [21, 0],
        [31, 0], // gir fast utstrekning
      ),
    );
    const arc = r.prims.find((p) => p[0] === 'A') as readonly [
      'A',
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const [ox] = r.offset;
    // OCS-sentrum (5,0) med normal −z ⇒ verdens-x = −5. Vinkler 0..90° ⇒ 90..180°.
    expect(arc[2] + ox).toBeCloseTo(-5, 6);
    expect(arc[5]).toBeCloseTo(90, 6);
    expect(arc[6]).toBeCloseTo(180, 6);
  });
});

describe('lesing av DXF – blokkregler', () => {
  const lineEnt = (
    layer: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): Array<[number, string | number]> => [
    [0, 'LINE'],
    [8, layer],
    [10, x1],
    [20, y1],
    [30, 0],
    [11, x2],
    [21, y2],
    [31, 0],
  ];
  const blockDef = (
    name: string,
    ...inner: Array<[number, string | number]>
  ): Array<[number, string | number]> => [
    [0, 'BLOCK'],
    [8, '0'],
    [2, name],
    [70, 0],
    [10, 0],
    [20, 0],
    [30, 0],
    ...inner,
    [0, 'ENDBLK'],
    [8, '0'],
  ];
  const withLayers = (...pairs: Array<[number, string | number]>) =>
    dxf(
      [0, 'SECTION'],
      [2, 'TABLES'],
      [0, 'TABLE'],
      [2, 'LAYER'],
      [70, 2],
      [0, 'LAYER'],
      [2, '0'],
      [70, 0],
      [62, 7],
      [0, 'LAYER'],
      [2, 'VEG'],
      [70, 0],
      [62, 3],
      [0, 'ENDTAB'],
      [0, 'ENDSEC'],
      ...pairs,
    );

  it('entiteter på lag 0 i en blokk arver INSERT-ens lag', () => {
    const r = ok(
      withLayers(
        [0, 'SECTION'],
        [2, 'BLOCKS'],
        ...blockDef('B', ...lineEnt('0', 0, 0, 1, 0)),
        [0, 'ENDSEC'],
        [0, 'SECTION'],
        [2, 'ENTITIES'],
        [0, 'INSERT'],
        [8, 'VEG'],
        [2, 'B'],
        [10, 0],
        [20, 0],
        [30, 0],
        [0, 'ENDSEC'],
      ),
    );
    const layer = r.prims[0]![1] as number;
    expect(r.layers[layer]).toEqual({ name: 'VEG', color: 3 });
  });

  it('matrisemellomrom måles i INSERT-ens rotasjonsramme uten skalering', () => {
    const r = ok(
      dxf(
        [0, 'SECTION'],
        [2, 'BLOCKS'],
        ...blockDef('B', ...lineEnt('0', 0, 0, 1, 0)),
        [0, 'ENDSEC'],
        [0, 'SECTION'],
        [2, 'ENTITIES'],
        [0, 'INSERT'],
        [8, '0'],
        [2, 'B'],
        [10, 100],
        [20, 50],
        [30, 0],
        [41, 2],
        [42, 2],
        [50, 90],
        [70, 2],
        [71, 1],
        [44, 10],
        [45, 0],
        [0, 'ENDSEC'],
      ),
    );
    expect(r.prims).toHaveLength(2);
    const [ox, oy] = r.offset;
    const starts = r.prims.map((p) => {
      const q = p as readonly ['L', number, number, number, number, number];
      return [+(q[2] + ox).toFixed(6), +(q[3] + oy).toFixed(6)];
    });
    // Første kopi i (100,50). Andre kopi: 10 enheter «bortover» i rotert ramme (90°) = (0, +10), IKKE 20.
    expect(starts).toContainEqual([100, 50]);
    expect(starts).toContainEqual([100, 60]);
  });
});
