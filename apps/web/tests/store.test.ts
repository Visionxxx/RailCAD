import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadProject, type RailProject } from '@railcad/domain';
import { geometryEngine as engine } from '../src/engine';
import { transformObjects } from '../src/commands/builders';
import { HISTORY_LIMIT, useProjectStore } from '../src/stores/project';

const line = (y: number, len = 10) => ({
  kind: 'line' as const,
  start: [0, y] as [number, number],
  headingRad: 0,
  lengthM: len,
});

function setup() {
  setActivePinia(createPinia());
  return useProjectStore();
}

describe('prosjektstore og historikk', () => {
  let store: ReturnType<typeof useProjectStore>;
  beforeEach(() => {
    store = setup();
    store.reset();
  });

  it('oppretter spor med stabile ID-er og angrer/gjør om deterministisk', () => {
    store.addTrack(line(0));
    store.addTrack(line(5));
    expect(store.objects.map((o) => o.id)).toEqual(['track-001', 'track-002']);
    store.undo();
    expect(store.objects.map((o) => o.id)).toEqual(['track-001']);
    store.redo();
    expect(store.objects.map((o) => o.id)).toEqual(['track-001', 'track-002']);
    expect(store.canRedo).toBe(false);
  });

  it('sletting fjerner tilknyttede lengdemål, og angre gjenoppretter alt på opprinnelig plass', () => {
    store.addTrack(line(0));
    store.addTrack(line(5));
    store.addDimension({ kind: 'length', targetId: 'track-001', offsetM: 2 });
    store.addTrack(line(10));
    const before = JSON.stringify(store.objects);
    store.deleteIds(['track-001']);
    expect(store.objects.map((o) => o.id)).toEqual(['track-002', 'track-003']);
    store.undo();
    expect(JSON.stringify(store.objects)).toBe(before);
  });

  it('endring av egenskap kan angres, og ny handling tømmer gjør-om-stakken', () => {
    const id = store.addTrack(line(0, 140));
    const t = store.byId.get(id)!;
    store.updateObject({ ...t, geometry: line(0, 150) } as typeof t, 'Endre lengde');
    expect(store.lastUndoLabel).toBe('Endre lengde');
    store.undo();
    expect((store.byId.get(id) as any).geometry.lengthM).toBe(140);
    store.addTrack(line(3));
    expect(store.canRedo).toBe(false);
  });

  it('beholder minst 50 (her 200) angresteg og dropper de eldste', () => {
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(50);
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) store.addTrack(line(i));
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store.undo();
    expect(store.objects.length).toBe(10);
  });

  it('rydder seleksjonen for objekter som forsvinner', () => {
    const id = store.addTrack(line(0));
    expect(store.selection).toEqual([id]);
    store.undo();
    expect(store.selection).toEqual([]);
  });

  it('dirty-status følger lagring og angre', () => {
    store.addTrack(line(0));
    expect(store.dirty).toBe(true);
    store.markSaved();
    expect(store.dirty).toBe(false);
    store.undo();
    expect(store.dirty).toBe(true);
  });

  it('flytting endrer frie mål men lar lengdemål følge sporet', () => {
    const demo: RailProject = {
      schemaVersion: '0.1.0',
      project: { id: 'p', name: 'p', units: 'm', coordinateSystem: { type: 'local_xy' } },
      objects: [
        { id: 'track-001', type: 'track_segment', geometry: line(0, 10) },
        {
          id: 'dim-001',
          type: 'dimension',
          dimension: { kind: 'length', targetId: 'track-001', offsetM: 1 },
        },
        {
          id: 'dim-002',
          type: 'dimension',
          dimension: { kind: 'distance', a: [0, 0], b: [3, 4], offsetM: 1 },
        },
      ],
      connections: [],
    };
    const loaded = loadProject(demo);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    store.load(loaded.project);
    const ids = new Set(['track-001', 'dim-001', 'dim-002']);
    expect(
      store.execute(
        transformObjects(store.objects, ids, engine, { type: 'move', dx: 2, dy: 3 }, 'Flytt'),
      ),
    ).toBe(true);
    expect((store.byId.get('track-001') as any).geometry.start).toEqual([2, 3]);
    expect((store.byId.get('dim-002') as any).dimension).toMatchObject({ a: [2, 3], b: [5, 7] });
    expect((store.byId.get('dim-001') as any).dimension.offsetM).toBe(1);
    // bare et lengdemål valgt → ingenting å flytte
    expect(
      transformObjects(
        store.objects,
        new Set(['dim-001']),
        engine,
        { type: 'move', dx: 1, dy: 1 },
        'Flytt',
      ),
    ).toBeNull();
  });

  it('rotasjon om pivot roterer spor og frie mål', () => {
    store.addTrack(line(0, 10));
    const patch = transformObjects(
      store.objects,
      new Set(['track-001']),
      engine,
      { type: 'rotate', pivot: [0, 0], angleRad: Math.PI / 2 },
      'Roter',
    );
    store.execute(patch);
    const g = (store.byId.get('track-001') as any).geometry;
    expect(g.headingRad).toBeCloseTo(Math.PI / 2, 12);
    expect(engine.endPose(g).point[1]).toBeCloseTo(10, 9);
    expect(engine.endPose(g).point[0]).toBeCloseTo(0, 9);
  });
});

describe('koblinger i prosjektstore', () => {
  let store: ReturnType<typeof useProjectStore>;
  beforeEach(() => {
    store = setup();
    store.reset();
    store.addTrack(line(0, 10)); // track-001: (0,0) → (10,0)
  });

  it('nytt spor fra port gir spor og kobling i én angrebar handling', () => {
    const id = store.addTrackFromPort(
      { kind: 'line', start: [10, 0], headingRad: 0, lengthM: 5 },
      { objectId: 'track-001', port: 'end' },
    );
    expect(id).toBe('track-002');
    expect(store.connections).toEqual([
      { a: { objectId: 'track-001', port: 'end' }, b: { objectId: 'track-002', port: 'start' } },
    ]);
    expect(store.connectionResults[0]?.status).toBe('ok');
    store.undo();
    expect(store.objects).toHaveLength(1);
    expect(store.connections).toEqual([]);
    store.redo();
    expect(store.connections).toHaveLength(1);
  });

  it('avviser kobling av port som allerede er i bruk, og lar angre fjerne koblinger', () => {
    store.addTrack({ kind: 'line', start: [10, 0], headingRad: 0, lengthM: 5 });
    store.addTrack({ kind: 'line', start: [10, 0], headingRad: 0, lengthM: 5 });
    expect(store.connectionSuggestions.length).toBeGreaterThan(0);
    expect(
      store.connect(
        { objectId: 'track-001', port: 'end' },
        { objectId: 'track-002', port: 'start' },
      ),
    ).toBe(true);
    expect(
      store.connect(
        { objectId: 'track-001', port: 'end' },
        { objectId: 'track-003', port: 'start' },
      ),
    ).toBe(false);
    expect(
      store.connect({ objectId: 'track-002', port: 'end' }, { objectId: 'track-002', port: 'end' }),
    ).toBe(false);
    store.removeConnection(0);
    expect(store.connections).toEqual([]);
    store.undo();
    expect(store.connections).toHaveLength(1);
  });

  it('sletting av spor fjerner koblinger til det – og angre gjenoppretter dem', () => {
    store.addTrackFromPort(
      { kind: 'line', start: [10, 0], headingRad: 0, lengthM: 5 },
      { objectId: 'track-001', port: 'end' },
    );
    store.deleteIds(['track-002']);
    expect(store.connections).toEqual([]);
    store.undo();
    expect(store.connections).toHaveLength(1);
  });

  it('endring av et koblet spor flytter ikke noe, men gir avvik i koblingskontrollen', () => {
    store.addTrackFromPort(
      { kind: 'line', start: [10, 0], headingRad: 0, lengthM: 5 },
      { objectId: 'track-001', port: 'end' },
    );
    const t = store.byId.get('track-001') as any;
    store.updateObject({ ...t, geometry: { ...t.geometry, lengthM: 12 } }, 'Endre lengde');
    const r = store.connectionResults[0]!;
    expect(r.status).toBe('position');
    expect(r.distanceM).toBeCloseTo(2, 12);
    expect((store.byId.get('track-002') as any).geometry.start).toEqual([10, 0]); // uendret
  });
});

describe('sporveksler i prosjektstore', () => {
  const placement = (x = 0) => ({
    catalogId: 'trv-60E1-1:9-R300-EVF',
    catalogRevision: 'test',
    position: [x, 0] as [number, number],
    headingRad: 0,
    hand: 'left' as const,
  });
  let store: ReturnType<typeof useProjectStore>;
  beforeEach(() => {
    store = setup();
    store.reset();
  });

  it('plasserer sporveksel med tre porter og snappbare segmenter', () => {
    const id = store.addTurnout(placement());
    expect(id).toBe('turnout-001');
    expect([...store.portPoses.keys()].sort()).toEqual([
      'turnout-001:diverging_out',
      'turnout-001:stem_in',
      'turnout-001:stem_out',
    ]);
    expect(store.trackRefs.map((r) => r.id)).toEqual(['turnout-001#0', 'turnout-001#1']); // stamspor + bue (D mangler)
    expect(store.freePorts).toHaveLength(3);
  });

  it('plassering fra port gir sporveksel og kobling i én angrehandling, og kontrollen er OK', () => {
    store.addTrack(line(0, 20));
    store.addTurnout({ ...placement(20) }, { objectId: 'track-001', port: 'end' });
    expect(store.connections).toEqual([
      {
        a: { objectId: 'track-001', port: 'end' },
        b: { objectId: 'turnout-001', port: 'stem_in' },
      },
    ]);
    expect(store.connectionResults[0]?.status).toBe('ok');
    store.undo();
    expect(store.objects).toHaveLength(1);
    expect(store.connections).toEqual([]);
  });

  it('flytting og rotasjon endrer plasseringen, ikke katalogdata; sletting fjerner koblinger', () => {
    store.addTrack(line(0, 20));
    store.addTurnout(placement(20), { objectId: 'track-001', port: 'end' });
    store.execute(
      transformObjects(
        store.objects,
        new Set(['turnout-001']),
        engine,
        { type: 'move', dx: 1, dy: 2 },
        'Flytt',
      ),
    );
    const t = store.byId.get('turnout-001') as any;
    expect(t.turnout.position).toEqual([21, 2]);
    expect(t.turnout.catalogId).toBe('trv-60E1-1:9-R300-EVF');
    expect(store.connectionResults[0]?.status).toBe('position'); // rapportert, ikke rettet
    store.execute(
      transformObjects(
        store.objects,
        new Set(['turnout-001']),
        engine,
        { type: 'rotate', pivot: [21, 2], angleRad: 1 },
        'Roter',
      ),
    );
    expect((store.byId.get('turnout-001') as any).turnout.headingRad).toBeCloseTo(1, 12);
    store.deleteIds(['turnout-001']);
    expect(store.connections).toEqual([]);
  });
});

describe('bakgrunner i prosjektstore', () => {
  const bg = (id = 'bg-001') => ({
    kind: 'dxf' as const,
    id,
    name: 'kart',
    visible: true,
    opacity: 1,
    placement: {
      origin: [0, 0] as [number, number],
      scaleMPerUnit: 1,
      rotationRad: 0,
      scaleConfirmed: true,
    },
    layers: [{ name: '0', color: 7 }],
    prims: [['L', 0, 0, 0, 10, 10]] as any,
    sourceUnits: 'meters',
    extents: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  });
  let store: ReturnType<typeof useProjectStore>;
  beforeEach(() => {
    store = setup();
    store.reset();
  });

  it('import, endring og fjerning kan angres og gjøres om', () => {
    store.addBackground(bg());
    store.updateBackground('bg-001', (b) => ({ ...b, visible: false }), 'Skjul bakgrunn');
    expect(store.backgrounds[0]?.visible).toBe(false);
    store.removeBackground('bg-001');
    expect(store.backgrounds).toEqual([]);
    store.undo();
    expect(store.backgrounds).toHaveLength(1);
    store.undo();
    expect(store.backgrounds[0]?.visible).toBe(true);
    store.undo();
    expect(store.backgrounds).toEqual([]);
    store.redo();
    expect(store.backgrounds).toHaveLength(1);
  });

  it('delvise endringer uten effekt gir ingen historikkpost; bakgrunner tas med i toProject kun når de finnes', () => {
    expect(store.toProject().backgrounds).toBeUndefined();
    store.addBackground(bg());
    const steps = store.canUndo;
    expect(store.updateBackground('bg-001', (b) => b, 'Ingen endring')).toBe(false);
    expect(store.updateBackground('finnes-ikke', (b) => ({ ...b }), 'x')).toBe(false);
    expect(steps).toBe(true);
    expect(store.toProject().backgrounds).toHaveLength(1);
  });

  it('bakgrunner berører ikke koblingskontroll eller objektliste', () => {
    store.addBackground(bg());
    expect(store.objects).toEqual([]);
    expect(store.connectionResults).toEqual([]);
  });
});

describe('ulagret-status og historikk', () => {
  let store: ReturnType<typeof useProjectStore>;
  beforeEach(() => {
    store = setup();
    store.reset();
  });

  it('å angre tilbake til lagret tilstand gjør prosjektet «lagret» igjen; gjør om gjør det ulagret', () => {
    expect(store.dirty).toBe(false);
    store.addTrack(line(0));
    expect(store.dirty).toBe(true);
    store.markSaved();
    expect(store.dirty).toBe(false);
    store.addTrack(line(5));
    expect(store.dirty).toBe(true);
    store.undo(); // tilbake til lagret punkt
    expect(store.dirty).toBe(false);
    store.undo(); // forbi lagret punkt
    expect(store.dirty).toBe(true);
    store.redo();
    expect(store.dirty).toBe(false);
    store.redo();
    expect(store.dirty).toBe(true);
  });

  it('endret prosjektnavn er ulagret, og lagring rydder det; gjenopprettet arbeid er ulagret', () => {
    store.updateMeta({ name: 'Nytt navn' });
    expect(store.dirty).toBe(true);
    store.markSaved();
    expect(store.dirty).toBe(false);
    store.touch();
    expect(store.dirty).toBe(true);
  });

  it('historikkhopp (angre, gjør om, åpne) øker epoken slik at åpne verktøy kan avbrytes', () => {
    const e0 = store.historyEpoch;
    store.addTrack(line(0));
    expect(store.historyEpoch).toBe(e0); // vanlig redigering teller ikke
    store.undo();
    store.redo();
    store.reset();
    expect(store.historyEpoch).toBe(e0 + 3);
  });

  it('connectAll kobler flere par som ÉN handling og hopper over porter som allerede er brukt', () => {
    store.addTrack(line(0, 10)); // track-001: (0,0)→(10,0)
    store.addTrack({ kind: 'line', start: [10, 0], headingRad: 0, lengthM: 5 }); // track-002
    store.addTrack({ kind: 'line', start: [10, 0], headingRad: 0, lengthM: 5 }); // track-003, samme start som 002
    const pairs = store.connectionSuggestions;
    expect(pairs.length).toBeGreaterThanOrEqual(2); // 001.end finnes mot både 002.start og 003.start
    const before = store.connections.length;
    const n = store.connectAll(pairs);
    expect(n).toBeLessThan(pairs.length); // 001.end kan bare brukes én gang
    expect(store.connections.length).toBe(before + n);
    store.undo(); // én handling reverserer alle
    expect(store.connections).toHaveLength(before);
  });
});

describe('kryssende spor', () => {
  let store: ReturnType<typeof useProjectStore>;
  const cross = () => {
    store.addTrack({ kind: 'line', start: [-10, 0], headingRad: 0, lengthM: 20 }); // track-001
    store.addTrack({ kind: 'line', start: [0, -10], headingRad: Math.PI / 2, lengthM: 20 }); // track-002
  };
  beforeEach(() => {
    store = setup();
    store.reset();
  });

  it('finner kryssing mellom ulike spor, men ikke mellom spor koblet ende mot ende', () => {
    cross();
    expect(store.crossingIssues).toHaveLength(1);
    expect(store.crossingIssues[0]).toMatchObject({
      kind: 'crossing',
      key: 'track-001|track-002',
      acknowledged: false,
    });
    expect(store.openCrossingCount).toBe(1);

    store.reset();
    store.addTrack({ kind: 'line', start: [0, 0], headingRad: 0, lengthM: 10 });
    store.addTrack({ kind: 'line', start: [10, 0], headingRad: 0.2, lengthM: 10 }); // møtes i endepunktet
    expect(store.crossingIssues).toEqual([]);
  });

  it('«planskilt»-bekreftelse kan angres, lagres i prosjektet og beholdes ved åpning', () => {
    cross();
    store.toggleCrossingAck('track-001|track-002');
    expect(store.openCrossingCount).toBe(0);
    expect(store.crossingIssues[0]?.acknowledged).toBe(true);
    expect(store.toProject().acknowledgedCrossings).toEqual(['track-001|track-002']);
    store.undo();
    expect(store.openCrossingCount).toBe(1);
    store.redo();
    const saved = store.toProject();
    store.reset();
    store.load(saved);
    expect(store.crossingIssues).toHaveLength(1);
    expect(store.crossingIssues[0]?.acknowledged).toBe(true); // bekreftelsen overlever lagring og åpning
    expect(store.openCrossingCount).toBe(0);
  });

  it('gamle bekreftelser for slettede spor tas ikke med i prosjektfilen', () => {
    cross();
    store.toggleCrossingAck('track-001|track-002');
    store.deleteIds(['track-002']);
    expect(store.toProject().acknowledgedCrossings).toBeUndefined();
    store.undo(); // sporet er tilbake – bekreftelsen gjelder igjen
    expect(store.toProject().acknowledgedCrossings).toEqual(['track-001|track-002']);
  });
});
