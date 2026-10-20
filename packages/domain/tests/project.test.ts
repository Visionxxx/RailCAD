import { describe, expect, it } from 'vitest';
import {
  createEmptyProject, loadProject, nextId, serializeProject, validateGeometry, validateProject,
  type RailProject,
} from '../src';

const demo = (): RailProject => ({
  schemaVersion: '0.1.0',
  project: { id: 'p', name: 'Demo', units: 'm', coordinateSystem: { type: 'local_xy' } },
  objects: [
    { id: 'track-001', type: 'track_segment', geometry: { kind: 'line', start: [0, 0], headingRad: 0, lengthM: 140 } },
    { id: 'track-002', type: 'track_segment', geometry: { kind: 'arc', start: [0, 10], headingRad: 0, signedRadiusM: 300, sweepRad: 0.15 } },
    { id: 'dim-001', type: 'dimension', dimension: { kind: 'length', targetId: 'track-001', offsetM: 2 } },
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
    ['kobling til ukjent objekt', (p: any) => p.connections.push({ a: { objectId: 'x', port: 'start' }, b: { objectId: 'track-001', port: 'end' } }), 'connections'],
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
    expect(validateGeometry({ kind: 'line', start: [0, 0], headingRad: 0, lengthM: 1 })).toEqual([]);
    expect(validateGeometry({ kind: 'line', start: [0, 0], headingRad: NaN, lengthM: 1 })).not.toEqual([]);
    expect(validateGeometry({ kind: 'arc', start: [0, 0], headingRad: 0, signedRadiusM: -50, sweepRad: 1 })).toEqual([]);
  });

  it('genererer deterministiske, unike ID-er', () => {
    expect(nextId('track', [])).toBe('track-001');
    expect(nextId('track', ['track-001', 'track-007', 'dim-009'])).toBe('track-008');
    expect(createEmptyProject('X').objects).toEqual([]);
  });
});
