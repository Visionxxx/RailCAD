import type { Vec2 } from '@railcad/domain';

export const TWO_PI = 2 * Math.PI;

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
export const norm = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const unit = (heading: number): Vec2 => [Math.cos(heading), Math.sin(heading)];
/** Venstre normal til en retning (90° mot klokka). */
export const leftNormal = (heading: number): Vec2 => [-Math.sin(heading), Math.cos(heading)];

export function rotate(p: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

export function rotateAbout(p: Vec2, pivot: Vec2, angle: number): Vec2 {
  return add(pivot, rotate(sub(p, pivot), angle));
}

/** Vinkel i [0, 2π). */
export function mod2pi(a: number): number {
  const r = a % TWO_PI;
  return r < 0 ? r + TWO_PI : r;
}

/** Vinkel i (-π, π]. */
export function normalizeAngle(a: number): number {
  const r = mod2pi(a);
  return r > Math.PI ? r - TWO_PI : r;
}
