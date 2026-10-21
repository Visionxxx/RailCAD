import {
  isCrossing,
  isTrack,
  isTurnout,
  type RailObject,
  type TrackGeometry,
} from '@railcad/domain';
import { lerpElevation, type SegmentElevation } from '@railcad/geometry-ts';
import { geometryEngine as engine } from '../engine';

/** En polylinje i 3D (meter). `z` er null der koten er ukjent (tegnes da på nivå 0 og merkes). */
export interface Polyline3D {
  objectId: string;
  points: Array<{ x: number; y: number; z: number | null; headingRad: number }>;
  /** Vekselsviller genereres separat (vekselens svillefelt), ikke langs hver akse. */
  noSleepers?: boolean;
}

export type Pt3 = { x: number; y: number; z: number | null; headingRad: number };

/** Skjematiske mål (meter) for sporbygningen i 3D. Generiske – ikke produktgeometri. */
export const RAIL_W = 0.12; // litt bredere enn et skinnehode (≈ 0,07) for å synes
export const RAIL_H = 0.18;
export const SLEEPER_LEN = 2.6;
export const SLEEPER_W = 0.26;
export const SLEEPER_H = 0.2;
export const SLEEPER_SPACING = 0.6;

export type StripKind = 'blade' | 'frog' | 'check' | 'machine' | 'stretcher';

/** En avlang del (tunge, hjerte, ledeskinne, stillverk, stagstang) langs en punktrekke. */
export interface StripPart {
  objectId: string;
  kind: StripKind;
  points: Pt3[];
  widthM: number;
  /** Høyde over sporbunnsnivå (z) til underkant, og høyde på delen. */
  baseM: number;
  heightM: number;
}

/** En svelle: midtpunkt, retning på sporet (svellen står på tvers) og lengde. */
export interface SleeperPlacement {
  objectId: string;
  x: number;
  y: number;
  z: number | null;
  headingRad: number;
  lengthM: number;
}

/** Sviller med fast avstand langs en punktrekke (posisjon, retning og kote interpoleres). */
export function sleepersAlong(
  objectId: string,
  points: readonly Pt3[],
  keep: (p: Pt3) => boolean = () => true,
  lengthM = SLEEPER_LEN,
): SleeperPlacement[] {
  const out: SleeperPlacement[] = [];
  let acc = 0;
  let next = SLEEPER_SPACING / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    for (; next <= acc + seg; next += SLEEPER_SPACING) {
      const t = seg > 0 ? (next - acc) / seg : 0;
      const p: Pt3 = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z === null || b.z === null ? null : a.z + (b.z - a.z) * t,
        headingRad: a.headingRad + (b.headingRad - a.headingRad) * t,
      };
      if (keep(p))
        out.push({ objectId, x: p.x, y: p.y, z: p.z, headingRad: p.headingRad, lengthM });
    }
    acc += seg;
  }
  return out;
}

const STEP_M = 2;
const MAX_POINTS = 400;

/**
 * Samler sporakser som punktrekker med kote, til skrivebeskyttet 3D-oversikt. Koten interpoleres
 * lineært mellom portkotene (samme modell som lengdeprofilen); ukjent kote gir z = null.
 */
export function collectPolylines(
  objects: readonly RailObject[],
  segmentsOf: (o: RailObject) => { segments: TrackGeometry[]; z: SegmentElevation[] } | null,
): Polyline3D[] {
  const out: Polyline3D[] = [];
  for (const o of objects) {
    if (!isTrack(o) && !isTurnout(o) && !isCrossing(o)) continue;
    const se = segmentsOf(o);
    if (!se) continue;
    se.segments.forEach((g, i) => {
      const len = engine.length(g);
      const n = Math.min(MAX_POINTS, Math.max(1, Math.ceil(len / STEP_M)));
      const e = se.z[i];
      const points = [];
      for (let k = 0; k <= n; k++) {
        const s = (len * k) / n;
        const pose = engine.poseAt(g, s);
        const p = pose.point;
        const z = e ? lerpElevation(e.zStart ?? undefined, e.zEnd ?? undefined, s, len) : undefined;
        points.push({ x: p[0], y: p[1], z: z ?? null, headingRad: pose.headingRad });
      }
      out.push({ objectId: o.id, points, ...(isTurnout(o) ? { noSleepers: true } : {}) });
    });
  }
  return out;
}

/** Sporvidde for skjematisk skinnevisning (som i 2D-visningen; ikke overbygningsprosjektering). */
export const GAUGE_M = 1.435;

/** Skinnehodets midtlinje: aksen forskjøvet ±GAUGE_M/2 vinkelrett på retningen (positiv = venstre). */
export function railPoint(
  p: { x: number; y: number; headingRad: number },
  side: 1 | -1,
): { x: number; y: number } {
  const o = (side * GAUGE_M) / 2;
  return { x: p.x - Math.sin(p.headingRad) * o, y: p.y + Math.cos(p.headingRad) * o };
}
