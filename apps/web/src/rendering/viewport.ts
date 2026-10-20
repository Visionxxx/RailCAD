import type { Bounds } from '@railcad/geometry-api';
import type { Vec2 } from '@railcad/domain';

/**
 * Visningstransformasjon. Verden er meter med Y opp; skjermen er piksler med Y ned.
 * Utsnittet (sentrum + skala) er ren visningstilstand og påvirker aldri prosjektgeometrien.
 */
export interface ViewState {
  /** Verdenskoordinat som ligger midt i tegneflaten. */
  cx: number;
  cy: number;
  /** Piksler per meter. */
  scale: number;
  width: number;
  height: number;
}

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 5000;

export function worldToScreen(v: ViewState, p: Vec2): Vec2 {
  return [v.width / 2 + (p[0] - v.cx) * v.scale, v.height / 2 - (p[1] - v.cy) * v.scale];
}

export function screenToWorld(v: ViewState, s: Vec2): Vec2 {
  return [v.cx + (s[0] - v.width / 2) / v.scale, v.cy - (s[1] - v.height / 2) / v.scale];
}

/** Zoom med skjermpunktet (sx, sy) som fast punkt – verdenspunktet under markøren blir stående. */
export function zoomAt(v: ViewState, sx: number, sy: number, factor: number): ViewState {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  const before = screenToWorld(v, [sx, sy]);
  const next = { ...v, scale };
  const after = screenToWorld(next, [sx, sy]);
  return { ...next, cx: v.cx + (before[0] - after[0]), cy: v.cy + (before[1] - after[1]) };
}

export function panBy(v: ViewState, dxPx: number, dyPx: number): ViewState {
  return { ...v, cx: v.cx - dxPx / v.scale, cy: v.cy + dyPx / v.scale };
}

/** Tilpasser utsnittet slik at `b` fyller flaten med litt luft. */
export function fitBounds(v: ViewState, b: Bounds | null, marginPx = 60): ViewState {
  if (!b) return { ...v, cx: 0, cy: 0, scale: 10 };
  const w = Math.max(b.maxX - b.minX, 1);
  const h = Math.max(b.maxY - b.minY, 1);
  const sx = Math.max(v.width - 2 * marginPx, 50) / w;
  const sy = Math.max(v.height - 2 * marginPx, 50) / h;
  return {
    ...v,
    scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(sx, sy))),
    cx: (b.minX + b.maxX) / 2,
    cy: (b.minY + b.maxY) / 2,
  };
}

export function visibleWorldRect(v: ViewState, marginPx = 0): Bounds {
  const [x0, y1] = screenToWorld(v, [-marginPx, -marginPx]);
  const [x1, y0] = screenToWorld(v, [v.width + marginPx, v.height + marginPx]);
  return { minX: x0, maxX: x1, minY: y0, maxY: y1 };
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function unionBounds(list: Iterable<Bounds>): Bounds | null {
  let out: Bounds | null = null;
  for (const b of list) {
    out = out
      ? {
          minX: Math.min(out.minX, b.minX), minY: Math.min(out.minY, b.minY),
          maxX: Math.max(out.maxX, b.maxX), maxY: Math.max(out.maxY, b.maxY),
        }
      : { ...b };
  }
  return out;
}

/** Rutenettavstand (1-2-5-serien) slik at småruter er minst `minPx` brede på skjermen. */
export function gridSteps(scale: number, minPx = 14): { minor: number; major: number } {
  const target = minPx / scale;
  const exp = Math.floor(Math.log10(target));
  const base = 10 ** exp;
  const mantissa = [1, 2, 5, 10].find((m) => m * base >= target * (1 - 1e-12)) ?? 10;
  const minor = mantissa * base;
  return { minor, major: minor * (mantissa === 2 ? 5 : 10) };
}
