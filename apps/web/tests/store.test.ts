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
