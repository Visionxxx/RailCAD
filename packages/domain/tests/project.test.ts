import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  loadProject,
  nextId,
  serializeProject,
  validateGeometry,
  validateProject,
  type RailProject,
} from '../src';

const demo = (): RailProject => ({
  schemaVersion: '0.1.0',
  project: { id: 'p', name: 'Demo', units: 'm', coordinateSystem: { type: 'local_xy' } },
  objects: [
    {
      id: 'track-001',
      type: 'track_segment',
      geometry: { kind: 'line', start: [0, 0], headingRad: 0, lengthM: 140 },
    },
    {
      id: 'track-002',
      type: 'track_segment',
      geometry: { kind: 'arc', start: [0, 10], headingRad: 0, signedRadiusM: 300, sweepRad: 0.15 },
    },
    {
      id: 'dim-001',
      type: 'dimension',
      dimension: { kind: 'length', targetId: 'track-001', offsetM: 2 },
    },
  ],
  connections: [],
});

describe('prosjektvalidering', () => {
  it('godtar spesifikasjonens eksempelformat og roundtripper uten tap', () => {
    const p = demo();
    const again = loadProject(JSON.parse(serializeProject(p)));
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.project).toEqual(p);
  });

  it('bevarer ukjente felt i stedet for å fjerne dem', () => {
    const raw = { ...demo(), futureField: { a: 1 } } as Record<string, unknown>;
    const r = validateProject(raw);
    expect(r.ok && (r.project as unknown as Record<string, unknown>).futureField).toEqual({ a: 1 });
  });

  it.each([
    ['manglende objects', (p: any) => delete p.objects, 'objects'],
    ['ukjent geometritype', (p: any) => (p.objects[0].geometry.kind = 'spiral'), 'kind'],
    ['lengde null', (p: any) => (p.objects[0].geometry.lengthM = 0), 'Lengde'],
    ['negativ lengde', (p: any) => (p.objects[0].geometry.lengthM = -3), 'Lengde'],
    ['radius null', (p: any) => (p.objects[1].geometry.signedRadiusM = 0), 'Radius'],
    ['sweep 360°', (p: any) => (p.objects[1].geometry.sweepRad = 2 * Math.PI), 'Sweep'],
    ['duplisert ID', (p: any) => (p.objects[1].id = 'track-001'), 'duplikat'],
    ['mål mot ukjent spor', (p: any) => (p.objects[2].dimension.targetId = 'nope'), 'ukjent'],
    ['tekst i stedet for tall', (p: any) => (p.objects[0].geometry.lengthM = '140'), 'lengthM'],
    [
      'kobling til ukjent objekt',
      (p: any) =>
        p.connections.push({
          a: { objectId: 'x', port: 'start' },
          b: { objectId: 'track-001', port: 'end' },
        }),
      'connections',
    ],
  ])('avviser: %s', (_name, mutate, needle) => {
    const p: any = demo();
    mutate(p);
    const r = validateProject(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain(needle);
  });

  it('avviser ukjent schemaVersion og ikke-objekter', () => {
    const r = loadProject({ ...demo(), schemaVersion: '9.9.9' });
    expect(r.ok).toBe(false);
    expect(loadProject([]).ok).toBe(false);
    expect(loadProject(null).ok).toBe(false);
  });
});

describe('geometriinvarianter og ID-er', () => {
  it('validerer enkeltgeometrier', () => {
    expect(validateGeometry({ kind: 'line', start: [0, 0], headingRad: 0, lengthM: 1 })).toEqual(
      [],
    );
    expect(
      validateGeometry({ kind: 'line', start: [0, 0], headingRad: NaN, lengthM: 1 }),
    ).not.toEqual([]);
    expect(
      validateGeometry({
        kind: 'arc',
        start: [0, 0],
        headingRad: 0,
        signedRadiusM: -50,
        sweepRad: 1,
      }),
    ).toEqual([]);
  });

  it('genererer deterministiske, unike ID-er', () => {
    expect(nextId('track', [])).toBe('track-001');
    expect(nextId('track', ['track-001', 'track-007', 'dim-009'])).toBe('track-008');
    expect(createEmptyProject('X').objects).toEqual([]);
  });
});

describe('koblingsregler', () => {
  const withConnections = (connections: unknown[]) => {
    const p: any = demo();
    p.objects.push({
      id: 'track-003',
      type: 'track_segment',
      geometry: { kind: 'line', start: [140, 0], headingRad: 0, lengthM: 10 },
    });
    p.connections = connections;
    return validateProject(p);
  };
  const c = (a: string, ap: string, b: string, bp: string) => ({
    a: { objectId: a, port: ap },
    b: { objectId: b, port: bp },
  });

  it('godtar gyldige koblinger', () => {
    expect(withConnections([c('track-001', 'end', 'track-003', 'start')]).ok).toBe(true);
  });
  it('avviser port som brukes i flere koblinger og kobling til seg selv', () => {
    const r = withConnections([
      c('track-001', 'end', 'track-003', 'start'),
      c('track-001', 'end', 'track-002', 'start'),
    ]);
    expect(!r.ok && r.errors.join()).toContain('koblet flere ganger');
    const self = withConnections([c('track-001', 'end', 'track-001', 'end')]);
    expect(self.ok).toBe(false);
  });
});

describe('sporveksler i prosjektfil', () => {
  const withTurnout = (turnout: Record<string, unknown>, connections: unknown[] = []) => {
    const p: any = demo();
    p.objects.push({ id: 'turnout-001', type: 'turnout', turnout });
    p.connections = connections;
    return validateProject(p);
  };
  const ok = {
    catalogId: 'trv-60E1-1:9-R300-EVF',
    catalogRevision: 'r',
    position: [0, 0],
    headingRad: 0,
    hand: 'left',
  };

  it('godtar kjent katalogtype og koblinger til vekselporter', () => {
    expect(withTurnout(ok).ok).toBe(true);
    const c = [
      {
        a: { objectId: 'track-001', port: 'end' },
        b: { objectId: 'turnout-001', port: 'stem_in' },
      },
    ];
    expect(withTurnout(ok, c).ok).toBe(true);
  });
  it('avviser ukjent katalogtype, ugyldig retning og porter som ikke finnes på objektet', () => {
    const unknown = withTurnout({ ...ok, catalogId: 'finnes-ikke' });
    expect(!unknown.ok && unknown.errors.join()).toContain('ukjent sporvekseltype');
    expect(withTurnout({ ...ok, hand: 'opp' }).ok).toBe(false);
    const wrong = [
      {
        a: { objectId: 'track-001', port: 'stem_in' },
        b: { objectId: 'turnout-001', port: 'stem_in' },
      },
    ];
    const r = withTurnout(ok, wrong);
    expect(!r.ok && r.errors.join()).toContain('finnes ikke på spor');
    const wrong2 = [
      { a: { objectId: 'track-001', port: 'end' }, b: { objectId: 'turnout-001', port: 'start' } },
    ];
    expect(withTurnout(ok, wrong2).ok).toBe(false);
  });
});

describe('størrelsesgrenser (overflow)', () => {
  it('avviser verdier som er endelige men gir uendelig/NaN videre', () => {
    expect(
      validateGeometry({
        kind: 'arc',
        start: [0, 0],
        headingRad: 0,
        signedRadiusM: 1e308,
        sweepRad: 3,
      }),
    ).not.toEqual([]);
    expect(
      validateGeometry({ kind: 'line', start: [0, 0], headingRad: 0, lengthM: 1e300 }),
    ).not.toEqual([]);
    expect(
      validateGeometry({ kind: 'line', start: [1e12, 0], headingRad: 0, lengthM: 10 }),
    ).not.toEqual([]);
    expect(
      validateGeometry({
        kind: 'arc',
        start: [0, 0],
        headingRad: 0,
        signedRadiusM: 9e6,
        sweepRad: 6,
      }),
    ).not.toEqual([]); // buelengde > grense
    // UTM-koordinater og realistiske verdier er greit
    expect(
      validateGeometry({ kind: 'line', start: [262000, 6649500], headingRad: 0, lengthM: 140 }),
    ).toEqual([]);
    expect(
      validateGeometry({
        kind: 'arc',
        start: [0, 0],
        headingRad: 0,
        signedRadiusM: 5000,
        sweepRad: 1,
      }),
    ).toEqual([]);
  });

  it('filer med slike verdier avvises ved åpning', () => {
    const p: any = demo();
    p.objects[1].geometry.signedRadiusM = 1e308;
    expect(validateProject(p).ok).toBe(false);
    const q: any = demo();
    q.objects[0].geometry.start = [1e15, 0];
    expect(validateProject(q).ok).toBe(false);
  });
});

describe('ID-tegnsett', () => {
  it.each(['a:b', 'x#1', 'med mellomrom', 'æøå'])('avviser ID «%s»', (id) => {
    const p: any = demo();
    p.objects[0].id = id;
    p.objects[2].dimension.targetId = id;
    const r = validateProject(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain('ID kan bare inneholde');
  });
});

describe('sporkryss i prosjektfil', () => {
  const withCrossing = (crossing: Record<string, unknown>, connections: unknown[] = []) => {
    const p: any = demo();
    p.objects.push({ id: 'crossing-001', type: 'crossing', crossing });
    p.connections = connections;
    return validateProject(p);
  };
  const ok = { position: [50, 5], headingRad: 0, ratioN: 9, halfLengthM: 17 };

  it('godtar gyldig sporkryss og koblinger til A/B-porter', () => {
    expect(withCrossing(ok).ok).toBe(true);
    const c = [
      {
        a: { objectId: 'track-001', port: 'end' },
        b: { objectId: 'crossing-001', port: 'a_start' },
      },
    ];
    expect(withCrossing(ok, c).ok).toBe(true);
  });
  it('avviser ugyldig forhold/lengde og feil portnavn', () => {
    expect(withCrossing({ ...ok, ratioN: 1 }).ok).toBe(false);
    expect(withCrossing({ ...ok, ratioN: 500 }).ok).toBe(false);
    expect(withCrossing({ ...ok, halfLengthM: 0 }).ok).toBe(false);
    expect(withCrossing({ ...ok, halfLengthM: 1e6 }).ok).toBe(false);
    const wrong = [
      {
        a: { objectId: 'track-001', port: 'end' },
        b: { objectId: 'crossing-001', port: 'stem_in' },
      },
    ];
    const r = withCrossing(ok, wrong);
    expect(!r.ok && r.errors.join()).toContain('sporkryss');
  });
});

describe('lag og låsing i prosjektfil', () => {
  it('godtar lag, locked og layerId; avviser ukjent lag og duplikat', () => {
    const p: any = demo();
    p.layers = [
      { id: 'standard', name: 'Standard', visible: true, locked: false },
      { id: 'lag-001', name: 'A', visible: false, locked: true },
    ];
    p.objects[0].layerId = 'lag-001';
    p.objects[0].locked = true;
    expect(validateProject(p).ok).toBe(true);
    const bad: any = demo();
    bad.objects[0].layerId = 'finnes-ikke';
    const r = validateProject(bad);
    expect(!r.ok && r.errors.join()).toContain('ukjent lag');
    const dup: any = demo();
    dup.layers = [
      { id: 'x', name: 'A', visible: true, locked: false },
      { id: 'x', name: 'B', visible: true, locked: false },
    ];
    expect(validateProject(dup).ok).toBe(false);
  });
});

describe('kryssveksel i prosjektfil', () => {
  const withSlip = (slip: Record<string, unknown>, half = 17) => {
    const p: any = demo();
    p.objects.push({
      id: 'crossing-001',
      type: 'crossing',
      crossing: { position: [0, 0], headingRad: 0, ratioN: 9, halfLengthM: half, slip },
    });
    return validateProject(p);
  };
  it('godtar gyldig slip og avviser for stor tangentlengde, ukjent type og ugyldig radius', () => {
    expect(withSlip({ arcs: 'both', radiusM: 200 }).ok).toBe(true); // T = 200·tan(3,17°) = 11,08 ≤ 17
    const tooBig = withSlip({ arcs: 'ab', radiusM: 400 }); // T = 22,2 > 17
    expect(!tooBig.ok && tooBig.errors.join()).toContain('tangentlengde');
    expect(withSlip({ arcs: 'xx', radiusM: 200 }).ok).toBe(false);
    expect(withSlip({ arcs: 'ab', radiusM: 0 }).ok).toBe(false);
  });
});
