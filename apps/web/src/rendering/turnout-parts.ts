import { type TurnoutDefinition, type TurnoutPlacement, type Vec2 } from '@railcad/domain';
import { geometryEngine as engine } from '../engine';
import {
  GAUGE_M,
  RAIL_H,
  SLEEPER_H,
  SLEEPER_SPACING,
  sleepersAlong,
  type Pt3,
  type SleeperPlacement,
  type StripPart,
} from './scene3d';

/**
 * Illustrative vekselmekanikk i 3D, utledet av vekselens akser og generiske proporsjoner:
 * tunger (6 m), hjerte, ledeskinner, stillverk, stagstang og vekselsviller (svillefelt som
 * dekker alle spor, med økende lengde). Dette er IKKE produktgeometri – ingen mål er hentet fra
 * tegninger – og skal ikke brukes til å vurdere vekselens utførelse.
 */
export const BLADE_LEN_M = 6;
export const FROG_LEN_M = 2.5;
export const CHECK_LEN_M = 3;
export const PANEL_SPLIT_M = 3.4; // svillefeltet deles når sporene er lenger fra hverandre enn dette
const STEP = 0.5;

type L = { x: number; y: number; h: number }; // lokal posisjon og retning

const off = (p: L, d: number): L => ({
  x: p.x - Math.sin(p.h) * d,
  y: p.y + Math.cos(p.h) * d,
  h: p.h,
});

/** Første skjæring mellom to polylinjer (lokale). Gir posisjon og indeks i `a`. */
export function firstCrossing(a: readonly L[], b: readonly L[], skipA = 0) {
  for (let i = Math.max(1, skipA); i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const p = a[i - 1]!,
        q = a[i]!,
        r = b[j - 1]!,
        s = b[j]!;
      const d1x = q.x - p.x,
        d1y = q.y - p.y,
        d2x = s.x - r.x,
        d2y = s.y - r.y;
      const den = d1x * d2y - d1y * d2x;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((r.x - p.x) * d2y - (r.y - p.y) * d2x) / den;
      const u = ((r.x - p.x) * d1y - (r.y - p.y) * d1x) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
        return { x: p.x + t * d1x, y: p.y + t * d1y, i: i - 1 + t };
    }
  }
  return null;
}

/** y (lokalt) på en akse ved gitt x (aksen går framover i x). Null utenfor aksens utstrekning. */
function yAt(axis: readonly L[], x: number): number | null {
  for (let i = 1; i < axis.length; i++) {
    const a = axis[i - 1]!,
      b = axis[i]!;
    if (x >= a.x && x <= b.x && b.x > a.x) return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return null;
}

export function turnoutParts(
  objectId: string,
  def: TurnoutDefinition,
  placement: TurnoutPlacement,
  /** Kote nær et punkt (verdenskoordinater) på vekselen, eller null hvis ukjent. */
  zAt: (p: Vec2) => number | null,
): { strips: StripPart[]; sleepers: SleeperPlacement[] } {
  const local = engine.turnoutLayout(def, {
    ...placement,
    position: [0, 0],
    headingRad: 0,
  });
  const gh = GAUGE_M / 2;
  const ph = placement.headingRad;
  const world = (p: L): Pt3 => {
    const x = p.x * Math.cos(ph) - p.y * Math.sin(ph) + placement.position[0];
    const y = p.x * Math.sin(ph) + p.y * Math.cos(ph) + placement.position[1];
    return { x, y, z: zAt([x, y]), headingRad: p.h + ph };
  };
  const strip = (
    kind: StripPart['kind'],
    pts: readonly L[],
    widthM: number,
    baseM: number,
    heightM: number,
  ): StripPart => ({ objectId, kind, points: pts.map(world), widthM, baseM, heightM });

  // Akser per rute, samplet med STEP.
  const axisOf = (segIdx: number[]): L[] => {
    const out: L[] = [];
    for (const i of segIdx) {
      const g = local.segments[i]!;
      const len = engine.length(g);
      const n = Math.max(1, Math.ceil(len / STEP));
      for (let k = out.length ? 1 : 0; k <= n; k++) {
        const pose = engine.poseAt(g, (len * k) / n);
        out.push({ x: pose.point[0], y: pose.point[1], h: pose.headingRad });
      }
    }
    return out;
  };
  const stemRoute = local.routes.find((r) => r.port === 'stem_out');
  const stem = stemRoute ? axisOf(stemRoute.segments) : null;
  const branches = local.routes
    .filter((r) => r.port !== 'stem_out')
    .map((r) => {
      const g = local.segments[r.segments[0]!]!;
      const sigma: 1 | -1 = g.kind === 'arc' && g.signedRadiusM < 0 ? -1 : 1;
      return { axis: axisOf(r.segments), sigma };
    });
  const strips: StripPart[] = [];
  const sleepers: SleeperPlacement[] = [];

  const upTo = (pts: readonly L[], length: number): L[] => {
    const out: L[] = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) acc += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      out.push(pts[i]!);
      if (acc >= length) break;
    }
    return out;
  };

  branches.forEach((b, bi) => {
    const sg = b.sigma;
    // Tunge for grenen: grenens skinne på siden mot stamsporet (−σ) de første meterne fra SS.
    const innerBranch = b.axis.map((p) => off(p, (-sg * GAUGE_M) / 2));
    strips.push(strip('blade', upTo(innerBranch, BLADE_LEN_M), 0.14, SLEEPER_H, RAIL_H + 0.02));
    // Partner-skinnen som grenens indre skinne krysser i hjertet.
    let partner: L[] | null = null;
    if (stem) {
      partner = stem.map((p) => off(p, (sg * GAUGE_M) / 2));
      // Tunge for stamsporet mot denne grenen (skinnen på siden σ).
      strips.push(strip('blade', upTo(partner, BLADE_LEN_M), 0.14, SLEEPER_H, RAIL_H + 0.02));
    } else {
      const other = branches[1 - bi];
      if (other) partner = other.axis.map((p) => off(p, (-other.sigma * GAUGE_M) / 2));
      if (bi === 1) partner = null; // ett hjerte for to grener uten stamspor
    }
    if (!partner) return;
    // Hjerte der grenens indre skinne møter partner-skinnen (etter tungen).
    const skip = Math.ceil(BLADE_LEN_M / STEP);
    const cross = firstCrossing(innerBranch, partner, skip);
    if (!cross) return;
    const i = Math.min(innerBranch.length - 1, Math.round(cross.i));
    const hh = innerBranch[i]!.h;
    const nose = stem ? hh / 2 : 0; // hjertets retning: halveringslinjen mellom sporene
    const half = FROG_LEN_M / 2;
    const frogPts: L[] = [-half, half].map((d) => ({
      x: cross.x + Math.cos(nose) * d,
      y: cross.y + Math.sin(nose) * d,
      h: nose,
    }));
    strips.push(strip('frog', frogPts, 0.3, SLEEPER_H, RAIL_H + 0.03));
    // Ledeskinner: innenfor skinnen overfor hjertet, på begge spor.
    if (stem) {
      const opp = stem
        .map((p) => off(p, (-sg * GAUGE_M) / 2 + sg * 0.07))
        .filter((p) => Math.abs(p.x - cross.x) <= CHECK_LEN_M / 2);
      strips.push(strip('check', opp, 0.09, SLEEPER_H, RAIL_H - 0.03));
    }
    const outerBranch = b.axis
      .map((p) => off(p, (sg * GAUGE_M) / 2 - sg * 0.07))
      .filter((p) => Math.hypot(p.x - cross.x, p.y - cross.y) <= CHECK_LEN_M / 2 + 0.5);
    strips.push(strip('check', outerBranch, 0.09, SLEEPER_H, RAIL_H - 0.03));
  });

  // Stillverk og stagstang ved tungespissene (bare med stamspor).
  if (stem && branches[0]) {
    const sg = branches[0].sigma;
    const side = -sg * (gh + 1.3);
    strips.push(
      strip(
        'machine',
        [
          { x: 1.2, y: side, h: 0 },
          { x: 2.2, y: side, h: 0 },
        ],
        0.55,
        0,
        0.6,
      ),
    );
    for (const x of [0.9, 3.2])
      strips.push(
        strip(
          'stretcher',
          [
            { x, y: -gh - 0.1, h: Math.PI / 2 },
            { x, y: gh + 0.1, h: Math.PI / 2 },
          ],
          0.08,
          SLEEPER_H + 0.02,
          0.06,
        ),
      );
  }

  // Vekselsviller: ett svillefelt vinkelrett på stamretningen, så lenge sporene ligger tett.
  const routes = [stem, ...branches.map((b) => b.axis)].filter((a): a is L[] => !!a);
  const maxX = Math.max(...routes.map((a) => a[a.length - 1]!.x));
  let splitX = maxX;
  for (let x = 0; x <= maxX; x += STEP) {
    const ys = routes.map((a) => yAt(a, x)).filter((v): v is number => v !== null);
    if (ys.length > 1 && Math.max(...ys) - Math.min(...ys) > PANEL_SPLIT_M) {
      splitX = x;
      break;
    }
  }
  for (let x = SLEEPER_SPACING / 2; x <= splitX; x += SLEEPER_SPACING) {
    const ys = routes.map((a) => yAt(a, x)).filter((v): v is number => v !== null);
    if (!ys.length) continue;
    const lo = Math.min(...ys) - (gh + 0.55);
    const hi = Math.max(...ys) + (gh + 0.55);
    const c = world({ x, y: (lo + hi) / 2, h: 0 });
    sleepers.push({ objectId, x: c.x, y: c.y, z: c.z, headingRad: ph, lengthM: hi - lo });
  }
  // Etter delingen: vanlige sviller langs hver akse.
  for (const a of routes) {
    sleepers.push(
      ...sleepersAlong(objectId, a.map(world), (_p) => true).filter((s) => {
        const lx =
          (s.x - placement.position[0]) * Math.cos(ph) +
          (s.y - placement.position[1]) * Math.sin(ph);
        return lx > splitX;
      }),
    );
  }
  return { strips, sleepers };
}
