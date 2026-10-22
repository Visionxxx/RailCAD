import { describe, expect, it } from 'vitest';
import { createEmptyProject, type RailObject, type RailProject } from '@railcad/domain';
import { geometryEngine as engine } from '../src/engine';
import { MAX_DRAFT_CHARS, decodeDraft, encodeDraft } from '../src/io/draft';
import {
  geometryIntersectsRect,
  objectsInRect,
  rectFromCorners,
  segmentIntersectsRect,
} from '../src/tools/boxselect';
import { lockAngle } from '../src/tools/tool';

const R = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

describe('valgboks', () => {
  it('rektangel fra to hjørner uavhengig av retning', () => {
    expect(rectFromCorners([5, -2], [-1, 3])).toEqual({ minX: -1, maxX: 5, minY: -2, maxY: 3 });
  });

  it('linjestykke mot rektangel: innenfor, gjennom, utenfor og tangerende', () => {
    expect(segmentIntersectsRect([2, 2], [3, 3], R)).toBe(true); // helt innenfor
    expect(segmentIntersectsRect([-5, 5], [15, 5], R)).toBe(true); // gjennom uten endepunkt innenfor
    expect(segmentIntersectsRect([-5, -5], [-1, 20], R)).toBe(false);
    expect(segmentIntersectsRect([-5, 11], [15, 11], R)).toBe(false);
    expect(segmentIntersectsRect([-1, 0], [11, 0], R)).toBe(true); // langs kanten
    expect(segmentIntersectsRect([-5, 15], [15, -5], R)).toBe(true); // diagonal over hjørnet
    expect(segmentIntersectsRect([-5, 26], [26, -5], R)).toBe(false); // diagonal (x+y=21) som bommer på hjørnet (10,10)
  });

  it('bue som svinger gjennom boksen uten at endepunktene er innenfor', () => {
    const arc = {
      kind: 'arc',
      start: [-20, 5],
      headingRad: 0,
      signedRadiusM: 30,
      sweepRad: 1,
    } as const;
    // Buen starter ved (-20,5), går mot høyre og opp; et vindu rundt midten av buen berøres.
    const mid = engine.poseAt(arc, engine.length(arc) / 2).point;
    const box = { minX: mid[0] - 1, maxX: mid[0] + 1, minY: mid[1] - 1, maxY: mid[1] + 1 };
    expect(geometryIntersectsRect(arc, box, engine)).toBe(true);
    expect(
      geometryIntersectsRect(arc, { ...box, minY: box.minY + 50, maxY: box.maxY + 50 }, engine),
    ).toBe(false);
  });

  const line = (id: string, y: number): RailObject => ({
    id,
    type: 'track_segment',
    geometry: { kind: 'line', start: [0, y], headingRad: 0, lengthM: 20 },
  });
  const objects = [line('a', 0), line('b', 10), line('c', 20)];
  const byId = new Map(objects.map((o) => [o.id, o] as const));

  it('vindu velger bare objekter helt innenfor; kryss velger alt som berøres', () => {
    const rect = { minX: -5, maxX: 25, minY: -5, maxY: 15 };
    expect(objectsInRect(objects, byId, rect, false, engine)).toEqual(['a', 'b']);
    const partial = { minX: 5, maxX: 8, minY: 8, maxY: 12 }; // berører b, omslutter ingen
    expect(objectsInRect(objects, byId, partial, false, engine)).toEqual([]);
    expect(objectsInRect(objects, byId, partial, true, engine)).toEqual(['b']);
  });

  it('sporveksler og mål tas med i valget', () => {
    const turnout: RailObject = {
      id: 'turnout-001',
      type: 'turnout',
      turnout: {
        catalogId: 'trv-60E1-1:9-R300-EVF',
        catalogRevision: 'r',
        position: [0, 0],
        headingRad: 0,
        hand: 'left',
      },
    };
    const dim: RailObject = {
      id: 'dim-001',
      type: 'dimension',
      dimension: { kind: 'length', targetId: 'a', offsetM: 2 },
    };
    const all = [...objects, turnout, dim];
    const map = new Map(all.map((o) => [o.id, o] as const));
    const rect = { minX: -5, maxX: 60, minY: -5, maxY: 15 };
    expect(objectsInRect(all, map, rect, false, engine)).toEqual([
      'a',
      'b',
      'turnout-001',
      'dim-001',
    ]);
    expect(
      objectsInRect(all, map, { minX: 30, maxX: 34, minY: -1, maxY: 1 }, true, engine),
    ).toEqual(['turnout-001']);
  });
});

describe('retningslåsing (Skift)', () => {
  const deg = (p: readonly [number, number]) => (Math.atan2(p[1], p[0]) * 180) / Math.PI;
  it('låser til nærmeste 15° og projiserer lengden', () => {
    const p = lockAngle([0, 0], [30, 2]); // ca. 3,8° → 0°
    expect(deg(p)).toBeCloseTo(0, 9);
    expect(p[0]).toBeCloseTo(Math.hypot(30, 2) * Math.cos(Math.atan2(2, 30)), 9);
    expect(deg(lockAngle([0, 0], [10, 10]))).toBeCloseTo(45, 9);
    const q = lockAngle([5, 5], [5 + 10, 5 + 4]); // 21,8° fra startpunktet → 15°
    expect(deg([q[0] - 5, q[1] - 5])).toBeCloseTo(15, 9);
    expect(deg(lockAngle([0, 0], [-10, -0.5]))).toBeCloseTo(-180, 6);
  });
  it('null-lengde gir uendret punkt', () => {
    expect(lockAngle([3, 3], [3, 3])).toEqual([3, 3]);
  });
});

describe('automatisk sikkerhetskopi (kladd)', () => {
  const project = (): RailProject => ({
    ...createEmptyProject('Prøve'),
    objects: [
      {
        id: 'track-001',
        type: 'track_segment',
        geometry: { kind: 'line', start: [0, 0], headingRad: 0, lengthM: 5 },
      },
    ],
  });

  it('roundtripper et gyldig prosjekt', () => {
    const text = encodeDraft(project(), new Date('2026-10-20T12:00:00Z'))!;
    const d = decodeDraft(text)!;
    expect(d.name).toBe('Prøve');
    expect(d.savedAt).toBe('2026-10-20T12:00:00.000Z');
    expect(d.project.objects).toHaveLength(1);
  });

  it('avviser ødelagt, manglende og ugyldig innhold i stedet for å gjenopprette et halvt prosjekt', () => {
    expect(decodeDraft(null)).toBeNull();
    expect(decodeDraft('{ikke json')).toBeNull();
    expect(decodeDraft(JSON.stringify({ savedAt: 'x', data: 5 }))).toBeNull();
    const bad = project();
    (bad.objects[0] as any).geometry.lengthM = -1;
    expect(decodeDraft(encodeDraft(bad))).toBeNull();
  });

  it('for store prosjekter får ingen kladd (grense under nettleserens kvote)', () => {
    const big = project();
    big.project.description = 'x'.repeat(MAX_DRAFT_CHARS + 10);
    expect(encodeDraft(big)).toBeNull();
  });
});

describe('kladd og flere faner', () => {
  it('«Forkast» sletter bare kladden som ble vist, ikke en nyere fra en annen fane', async () => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v),
      removeItem: (k: string) => void delete store[k],
    };
    const { clearDraftIfUnchanged, readDraft } = await import('../src/io/draft');
    const first = encodeDraft(project(), new Date('2026-10-20T10:00:00Z'))!;
    store['railcad.draft'] = first;
    const shown = readDraft()!;
    // En annen fane skriver en nyere kladd mens dialogen vises
    store['railcad.draft'] = encodeDraft(project(), new Date('2026-10-20T10:05:00Z'))!;
    clearDraftIfUnchanged(shown.savedAt);
    expect(readDraft()?.savedAt).toBe('2026-10-20T10:05:00.000Z'); // bevart
    clearDraftIfUnchanged('2026-10-20T10:05:00.000Z');
    expect(readDraft()).toBeNull(); // uendret kladd fjernes
    delete (globalThis as any).localStorage;
  });
});

function project(): RailProject {
  return {
    ...createEmptyProject('Prøve'),
    objects: [
      {
        id: 'track-001',
        type: 'track_segment',
        geometry: { kind: 'line', start: [0, 0], headingRad: 0, lengthM: 5 },
      },
    ],
  };
}
