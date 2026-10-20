import { describe, expect, it } from 'vitest';
import { TURNOUT_CATALOG, getTurnoutType } from '@railcad/domain';
import { portKey, type AssemblyPlan, type Pose } from '@railcad/geometry-api';
import { geometryEngine as e } from '../src';

type Ok = Extract<AssemblyPlan, { ok: true }>;

/** Bygger portkartet for en plan (nøkkel:port → pose) med samme geometri som appen bruker. */
function ports(plan: Ok) {
  const m = new Map<string, Pose>();
  const segs: Array<{ id: string; segments: any[] }> = [];
  for (const part of plan.parts) {
    if (part.turnout) {
      const l = e.turnoutLayout(getTurnoutType(part.turnout.catalogId)!, part.turnout);
      for (const [p, pose] of Object.entries(l.ports)) m.set(`${part.key}:${p}`, pose);
      segs.push({ id: part.key, segments: l.segments });
    } else if (part.crossing) {
      const l = e.crossingLayout(part.crossing);
      for (const [p, pose] of Object.entries(l.ports)) m.set(`${part.key}:${p}`, pose);
      segs.push({ id: part.key, segments: l.segments });
    } else if (part.track) {
      m.set(portKey(part.key, 'start'), e.portPose(part.track, 'start'));
      m.set(portKey(part.key, 'end'), e.portPose(part.track, 'end'));
      segs.push({ id: part.key, segments: [part.track] });
    }
  }
  return { ports: m, segs };
}

const plan = (typeId: string, spacing: number, half: number, over = {}) =>
  e.scissorsPlan(getTurnoutType(typeId)!, {
    position: [100, 50],
    headingRad: 0,
    spacingM: spacing,
    crossingHalfLengthM: half,
    ...over,
  });

describe('sovitet sporkryss (SRR)', () => {
  it.each(TURNOUT_CATALOG.map((t) => t.catalogId))(
    '%s: alle 12 koblinger er eksakte (posisjon og tangent)',
    (id) => {
      const r = plan(id, 7, 3);
      if (!r.ok) throw new Error(r.error);
      expect(r.parts).toHaveLength(11);
      expect(r.links).toHaveLength(12);
      const { ports: pm } = ports(r);
      const conns = r.links.map((l) => ({
        a: { objectId: l.a.key, port: l.a.port },
        b: { objectId: l.b.key, port: l.b.port },
      }));
      const results = e.evaluateConnections(pm, conns);
      expect(
        results
          .filter((x) => x.status !== 'ok')
          .map((x) => [x.connection, x.distanceM, x.tangentDeviationRad]),
      ).toEqual([]);
    },
  );

  it('kryssvinkelen er 2α og forbindelsene krysser i M; sporene ligger i riktig avstand', () => {
    const r = plan('trv-60E1-1:9-R300-EVF', 4.8, 5, { position: [0, 0] });
    if (!r.ok) throw new Error(r.error);
    const x = r.parts.find((p) => p.key === 'X')!.crossing!;
    expect(Math.atan(1 / x.ratioN)).toBeCloseTo(2 * Math.atan(1 / 9), 12);
    const t1 = r.parts.find((p) => p.key === 'T1')!.turnout!;
    const t4 = r.parts.find((p) => p.key === 'T4')!.turnout!;
    expect(t4.position[1] - t1.position[1]).toBeCloseTo(4.8, 12); // sporavstand
    expect(t1.position[0]).toBeCloseTo(t4.position[0], 12);
    // diagonalene d1 og d4 skjærer hverandre i M (kryssets sentrum)
    const d1 = r.parts.find((p) => p.key === 'd1')!.track!;
    const end = e.endPose(d1).point;
    const along = Math.hypot(end[0], end[1]);
    expect(along).toBeCloseTo(5, 9); // slutter på kryssets ende, 5 m (= halv lengde) fra M
  });

  it('plasseres og roteres rigid: avstander uendret, koblinger fortsatt eksakte', () => {
    const a = plan('trv-60E1-1:9-R300-EVF', 5, 4);
    const b = plan('trv-60E1-1:9-R300-EVF', 5, 4, { position: [-30, 12], headingRad: 1.1 });
    if (!a.ok || !b.ok) throw new Error('plan');
    const conns = b.links.map((l) => ({
      a: { objectId: l.a.key, port: l.a.port },
      b: { objectId: l.b.key, port: l.b.port },
    }));
    expect(e.evaluateConnections(ports(b).ports, conns).every((r) => r.status === 'ok')).toBe(true);
    const dist = (p: Ok, k1: string, k2: string) => {
      const pa = p.parts.find((x) => x.key === k1)!.turnout!.position;
      const pb = p.parts.find((x) => x.key === k2)!.turnout!.position;
      return Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
    };
    expect(dist(b, 'T1', 'T3')).toBeCloseTo(dist(a, 'T1', 'T3'), 9);
  });

  it('har ingen kryssing mellom delene utenom i midtkrysset (annet enn koblinger)', () => {
    const r = plan('trv-60E1-1:9-R300-EVF', 5, 4);
    if (!r.ok) throw new Error(r.error);
    const { segs } = ports(r);
    const hits = e.findIntersections(segs);
    // Kryssets akser møter diagonalene ende mot ende; ingenting skal krysse, berøre eller overlappe.
    expect(hits).toEqual([]);
  });

  it('for liten sporavstand gir klar feilmelding med minste avstand; for kort rom mellom vekslene gir overlappfeil', () => {
    const tight = plan('trv-60E1-1:9-R300-EVF', 1.5, 3);
    expect(tight.ok).toBe(false);
    if (!tight.ok) expect(tight.error).toMatch(/Minste sporavstand er \d/);
    const minM = Number((tight as { error: string }).error.match(/er ([\d.]+) m/)![1]);
    expect(plan('trv-60E1-1:9-R300-EVF', minM + 0.05, 3).ok).toBe(true);
    expect(plan('trv-60E1-1:9-R300-EVF', minM - 0.05, 3).ok).toBe(false);
    expect(plan('trv-60E1-1:9-R300-EVF', 5, 0).ok).toBe(false);
    expect(plan('trv-60E1-1:9-R300-EVF', -1, 3).ok).toBe(false);
  });
});
