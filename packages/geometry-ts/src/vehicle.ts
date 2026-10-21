import type { TrackGeometry, Vec2 } from '@railcad/domain';
import { arcCenter, bounds, closestPoint, length, poseAt } from './track';

/**
 * Kjøretøykontroll med brukerens egne mål (ingen standardverdier, ikke vurdert mot regelverk).
 * Alle mål i meter.
 */
export interface VehicleDims {
  /** Lengde over kropp. */
  lengthM: number;
  /** Avstand mellom boggisentre. */
  bogieCentreM: number;
  /** Største bredde. */
  widthM: number;
  /** Sideklaring som brukeren krever på hver side. */
  marginM: number;
}

export interface CurveSwing {
  /** Hvor mye kjøretøyets midtparti flytter seg innover i kurven (mot sirkelsenteret). */
  innerM: number;
  /** Hvor mye endepartiene svinger utover i kurven. */
  outerM: number;
}

/**
 * Utsving i en sirkelkurve med radius R, forutsatt at boggisentrene ligger på sporaksen:
 * innover (midten) δi = R − √(R² − (B/2)²), utover (endene) δo = √((B/2 + O)² + R² − (B/2)²) − R
 * der O = (L − B)/2 er overhenget utenfor boggisentrene. Null for rett spor (R = ∞).
 * Returnerer null når R ≤ B/2 (geometrien er ikke definert).
 */
export function curveSwing(radiusM: number, v: VehicleDims): CurveSwing | null {
  if (!Number.isFinite(radiusM)) return { innerM: 0, outerM: 0 };
  const half = v.bogieCentreM / 2;
  if (!(radiusM > half)) return null;
  const mid = Math.sqrt(radiusM * radiusM - half * half);
  const overhang = (v.lengthM - v.bogieCentreM) / 2;
  return {
    innerM: radiusM - mid,
    outerM: Math.sqrt((half + overhang) ** 2 + mid * mid) - radiusM,
  };
}

export interface CurveRow {
  id: string;
  radiusM: number;
  innerM: number;
  outerM: number;
}

export interface SpacingRow {
  a: string;
  b: string;
  /** Minste avstand mellom aksene (m). */
  distanceM: number;
  /** Nødvendig senteravstand: bredde + 2·klaring + utsving for begge spor (ved nærmeste punkt). */
  requiredM: number;
  status: 'ok' | 'tight';
}

export interface VehicleCheck {
  /** Sirkelkurver med utsving; `error` der kjøretøyet ikke passer i radius. */
  curves: CurveRow[];
  tooTight: string[];
  spacing: SpacingRow[];
}

export interface AxisItem {
  id: string;
  segments: readonly TrackGeometry[];
}

/** Avstander under dette regnes som tilkoblet/kryssende og er ikke et parallelt spor. */
const CONNECTED_M = 1;
/** Bare naboer innenfor dette undersøkes. */
const NEIGHBOUR_M = 15;
const SAMPLE_M = 1;
const MAX_SAMPLES = 400;

const near = (
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: typeof a,
  d: number,
) => a.minX - d <= b.maxX && b.minX - d <= a.maxX && a.minY - d <= b.maxY && b.minY - d <= a.maxY;

/** Utsving mot siden `toward` for punktet `p` på segmentet (innover hvis `toward` ligger mot sentrum). */
function swingToward(g: TrackGeometry, p: Vec2, toward: Vec2, v: VehicleDims): number | null {
  if (g.kind === 'line') return 0;
  const sw = curveSwing(Math.abs(g.signedRadiusM), v);
  if (!sw) return null;
  const c = arcCenter(g);
  const inward = (c[0] - p[0]) * (toward[0] - p[0]) + (c[1] - p[1]) * (toward[1] - p[1]) > 0;
  return inward ? sw.innerM : sw.outerM;
}

export function vehicleCheck(items: readonly AxisItem[], v: VehicleDims): VehicleCheck {
  const curves: CurveRow[] = [];
  const tooTight: string[] = [];
  for (const it of items) {
    for (const g of it.segments) {
      if (g.kind !== 'arc') continue;
      const r = Math.abs(g.signedRadiusM);
      const sw = curveSwing(r, v);
      if (!sw) {
        if (!tooTight.includes(it.id)) tooTight.push(it.id);
        continue;
      }
      curves.push({ id: it.id, radiusM: r, innerM: sw.innerM, outerM: sw.outerM });
    }
  }

  const boxes = items.map((it) => it.segments.map((g) => bounds(g)));
  const best = new Map<string, SpacingRow>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i]!;
      const B = items[j]!;
      let min = Infinity;
      let reqAtMin = NaN;
      A.segments.forEach((ga, ia) => {
        B.segments.forEach((gb, ib) => {
          if (!near(boxes[i]![ia]!, boxes[j]![ib]!, NEIGHBOUR_M)) return;
          const len = length(ga);
          const n = Math.min(MAX_SAMPLES, Math.max(1, Math.ceil(len / SAMPLE_M)));
          for (let k = 0; k <= n; k++) {
            const pa = poseAt(ga, (len * k) / n).point;
            const cb = closestPoint(gb, pa);
            if (cb.distanceM >= min) continue;
            const sa = swingToward(ga, pa, cb.point, v);
            const sb = swingToward(gb, cb.point, pa, v);
            min = cb.distanceM;
            reqAtMin = sa === null || sb === null ? NaN : v.widthM + 2 * v.marginM + sa + sb;
          }
        });
      });
      if (min < CONNECTED_M || min > NEIGHBOUR_M || Number.isNaN(reqAtMin)) continue;
      best.set(`${A.id}|${B.id}`, {
        a: A.id,
        b: B.id,
        distanceM: min,
        requiredM: reqAtMin,
        status: min + 1e-9 >= reqAtMin ? 'ok' : 'tight',
      });
    }
  }
  const spacing = [...best.values()].sort(
    (x, y) => x.distanceM - x.requiredM - (y.distanceM - y.requiredM),
  );
  return { curves, tooTight, spacing };
}
