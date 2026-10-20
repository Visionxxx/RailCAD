import { describe, expect, it } from 'vitest';
import { loadProject, isTurnout } from '@railcad/domain';
import { portKey, type Pose } from '@railcad/geometry-api';
import { geometryEngine as engine } from '@railcad/geometry-ts';
import { cachedTurnoutLayout } from '../src/rendering/turnouts';
import demo from '../../../fixtures/demo-verksted.json';
import lodalen from '../../../fixtures/demo-lodalen.json';

describe('eksempelprosjekter', () => {
  it('verkstedeksempelet er gyldig og har tre spor på 140 m', () => {
    const r = loadProject(demo);
    expect(r.ok).toBe(true);
  });

  it('Lodalen-inspirert plan er gyldig, merket illustrativ, og alle koblinger er OK', () => {
    const r = loadProject(lodalen);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.project;
    expect(p.project.description).toContain('IKKE Lodalens faktiske geometri');
    expect(p.objects.filter(isTurnout)).toHaveLength(8);
    expect(p.connections.length).toBeGreaterThanOrEqual(30);

    const ports = new Map<string, Pose>();
    for (const o of p.objects) {
      if (o.type === 'track_segment') {
        for (const port of ['start', 'end'] as const)
          ports.set(portKey(o.id, port), engine.portPose(o.geometry, port));
      } else if (isTurnout(o)) {
        const l = cachedTurnoutLayout(o)!;
        for (const [port, pose] of Object.entries(l.ports)) ports.set(`${o.id}:${port}`, pose);
      }
    }
    const results = engine.evaluateConnections(ports, p.connections);
    expect(results.filter((x) => x.status !== 'ok')).toEqual([]);
    // Alle spor ender i samme tverrlinje (parallelle spor med lik lengde langs aksen).
    expect(engine.findCoincidentFreePorts(ports, p.connections)).toEqual([]);
  });
});

describe('eksempelplanene har ingen kryssende spor', () => {
  it('verksted og Lodalen-inspirert plan: ingen kryssing, T-forbindelse eller overlapp', async () => {
    const { isTrack, isTurnout } = await import('@railcad/domain');
    for (const data of [demo, lodalen]) {
      const r = loadProject(data);
      if (!r.ok) throw new Error('ugyldig');
      const items = r.project.objects.flatMap((o) => {
        if (isTrack(o)) return [{ id: o.id, segments: [o.geometry] }];
        if (isTurnout(o)) return [{ id: o.id, segments: cachedTurnoutLayout(o)!.segments }];
        return [];
      });
      expect(engine.findIntersections(items)).toEqual([]);
    }
  });
});
