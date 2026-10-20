import { isTrack, type RailObject, type TrackGeometry, type Vec2 } from '@railcad/domain';
import { TOLERANCES } from '@railcad/geometry-api';
import { transformObjects, replaceObjects } from '../commands/builders';
import { fmtM } from '../format';
import { objectsInRect, rectFromCorners } from './boxselect';
import { pickObject } from './pick';
import { Tool, lineBetween } from './tool';
import type { Ghost, PointerInfo } from './types';

const DRAG_THRESHOLD_PX = 4;
const GRIP_RADIUS_PX = 9;

type Mode =
  | { kind: 'idle' }
  | { kind: 'pending'; screen: Vec2; base: Vec2; ids: string[] }
  | { kind: 'box'; screen: Vec2; a: Vec2; shift: boolean; moved: boolean }
  | { kind: 'moving'; base: Vec2; ids: string[]; delta: Vec2 }
  | {
      kind: 'grip';
      id: string;
      which: 'start' | 'end';
      next: TrackGeometry | null;
      /** Har pekeren beveget seg siden den ble trykt ned? Et rent klikk skal ikke endre noe. */
      moved: boolean;
    };

export class SelectTool extends Tool {
  readonly id = 'select' as const;
  readonly label = 'Marker';
  cursor = 'default';
  private mode: Mode = { kind: 'idle' };

  hint() {
    if (this.mode.kind === 'moving') return 'Slipp for å flytte. Esc avbryter.';
    if (this.mode.kind === 'grip') return 'Slipp for å sette endepunktet. Esc avbryter.';
    if (this.mode.kind === 'box')
      return 'Slipp for å velge. Mot høyre: helt innenfor. Mot venstre: alt som berøres. Skift legger til.';
    return 'Klikk for å velge (Skift = flervalg), dra på tom flate for valgboks. Dra et objekt for å flytte, dra endepunktene for å redigere.';
  }

  /** Snap er bare aktivt mens noe dras. */
  get dragging() {
    return this.mode.kind === 'moving' || this.mode.kind === 'grip';
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    const { project, view } = this.env;
    const pxPerM = view.view.scale;

    const grip = this.gripAt(p.world, (GRIP_RADIUS_PX + 2) / pxPerM);
    if (grip) {
      this.mode = { kind: 'grip', ...grip, next: null, moved: false };
      this.snapExclude = new Set([grip.id]);
      return;
    }

    const hit = pickObject(project.objects, project.byId, p.world, view.pickToleranceM);
    if (!hit) {
      // Tom flate: start valgboks. Et rent klikk (uten dra) fjerner valget i `up`.
      this.mode = { kind: 'box', screen: p.screen, a: p.world, shift: p.shift, moved: false };
      return;
    }
    if (p.shift) {
      project.toggleSelect(hit.id);
      return;
    }
    if (!project.selection.includes(hit.id)) project.select([hit.id]);
    const ids = [...project.selection];
    this.mode = {
      kind: 'pending',
      screen: p.screen,
      base: this.basePoint(hit.id, hit.point, view.pickToleranceM),
      ids,
    };
    this.snapExclude = new Set(ids);
  }

  move(p: PointerInfo) {
    const m = this.mode;
    if (m.kind === 'idle') {
      const { project, view } = this.env;
      const hit = pickObject(project.objects, project.byId, p.world, view.pickToleranceM);
      this.env.setPreview(hit ? { ghosts: [], hoverId: hit.id } : null);
      return;
    }
    if (m.kind === 'box') {
      if (
        !m.moved &&
        Math.hypot(p.screen[0] - m.screen[0], p.screen[1] - m.screen[1]) < DRAG_THRESHOLD_PX
      )
        return;
      m.moved = true;
      this.env.setPreview({
        ghosts: [],
        rect: { a: m.a, b: p.world, crossing: p.world[0] < m.a[0] },
      });
      return;
    }
    if (m.kind === 'pending') {
      if (Math.hypot(p.screen[0] - m.screen[0], p.screen[1] - m.screen[1]) < DRAG_THRESHOLD_PX)
        return;
      this.mode = { kind: 'moving', base: m.base, ids: m.ids, delta: [0, 0] };
    }
    if (this.mode.kind === 'moving') {
      const base = this.mode.base;
      const delta: Vec2 = [p.point[0] - base[0], p.point[1] - base[1]];
      this.mode.delta = delta;
      const ids = new Set(this.mode.ids);
      const ghosts: Ghost[] = [];
      for (const o of this.env.project.objects) {
        if (ids.has(o.id) && isTrack(o)) {
          ghosts.push({
            geometry: this.env.engine.translate(o.geometry, delta[0], delta[1]),
            valid: true,
          });
        }
      }
      this.env.setPreview({
        ghosts,
        hud: [`Δx = ${fmtM(delta[0])}`, `Δy = ${fmtM(delta[1])}`],
        hudValid: true,
      });
    } else if (this.mode.kind === 'grip') {
      const next = this.gripGeometry(this.mode.id, this.mode.which, p.point);
      this.mode.next = next;
      this.mode.moved = true;
      const e = this.env.engine;
      this.env.setPreview({
        ghosts: next ? [{ geometry: next, valid: true }] : [],
        hud: next ? [`L = ${fmtM(e.length(next))}`] : ['Ugyldig'],
        hudValid: !!next,
      });
    }
  }

  up(p: PointerInfo) {
    const m = this.mode;
    if (m.kind === 'box') {
      const { project, engine } = this.env;
      if (m.moved) {
        const rect = rectFromCorners(m.a, p.world);
        const hit = objectsInRect(project.objects, project.byId, rect, p.world[0] < m.a[0], engine);
        project.select(m.shift ? [...new Set([...project.selection, ...hit])] : hit);
      } else if (!m.shift) {
        project.select([]);
      }
      this.reset();
      return;
    }
    if (m.kind === 'moving') {
      const [dx, dy] = m.delta;
      if (dx !== 0 || dy !== 0) {
        const patch = transformObjects(
          this.env.project.objects,
          new Set(m.ids),
          this.env.engine,
          { type: 'move', dx, dy },
          'Flytt',
        );
        if (!this.env.project.execute(patch)) {
          this.env.ui.notify(
            'Lengdemål følger sporet og kan ikke flyttes alene – bruk Forskyvning i egenskapspanelet.',
          );
        }
      }
    } else if (m.kind === 'grip') {
      if (m.next) {
        const o = this.env.project.byId.get(m.id);
        if (o && isTrack(o)) {
          this.env.project.execute(
            replaceObjects(
              this.env.project.objects,
              new Map([[o.id, { ...o, geometry: m.next }]]),
              'Rediger endepunkt',
            ),
          );
        }
      } else if (m.moved) {
        this.env.ui.notify(
          'Endepunktet ga ugyldig geometri (for kort spor eller ugyldig bue).',
          'error',
        );
      }
    }
    this.reset();
  }

  key(k: { key: string }) {
    if (k.key === 'Escape') {
      if (this.mode.kind !== 'idle') {
        this.cancel();
      } else if (this.env.project.selection.length) {
        this.env.project.select([]);
      }
      return true;
    }
    return false;
  }

  cancel() {
    if (this.mode.kind === 'idle') return false;
    this.reset();
    return true;
  }

  private reset() {
    this.mode = { kind: 'idle' };
    this.snapExclude = undefined;
    this.env.setPreview(null);
  }

  /** Flytt-basispunktet er sporets endepunkt hvis man tok tak nær et, ellers der man klikket. */
  private basePoint(id: string, pickPoint: Vec2, tol: number): Vec2 {
    const o = this.env.project.byId.get(id);
    if (!o || !isTrack(o)) return pickPoint;
    const e = this.env.engine;
    for (const end of [o.geometry.start, e.endPose(o.geometry).point]) {
      if (Math.hypot(end[0] - pickPoint[0], end[1] - pickPoint[1]) <= tol) return end;
    }
    return pickPoint;
  }

  private gripAt(world: Vec2, tolM: number): { id: string; which: 'start' | 'end' } | null {
    const sel = this.env.project.selectedObjects;
    if (sel.length !== 1) return null;
    const o = sel[0] as RailObject;
    if (!isTrack(o)) return null;
    const end = this.env.engine.endPose(o.geometry).point;
    const dEnd = Math.hypot(end[0] - world[0], end[1] - world[1]);
    const dStart = Math.hypot(o.geometry.start[0] - world[0], o.geometry.start[1] - world[1]);
    if (dEnd <= tolM && dEnd <= dStart) return { id: o.id, which: 'end' };
    if (dStart <= tolM) return { id: o.id, which: 'start' };
    return null;
  }

  /**
   * Direkte redigering av endepunkt.
   * Rett spor: det andre endepunktet står fast. Bue: startgrep flytter hele buen,
   * sluttgrep endrer sveipet med radius, start og starttangent uendret.
   */
  private gripGeometry(id: string, which: 'start' | 'end', target: Vec2): TrackGeometry | null {
    const o = this.env.project.byId.get(id);
    if (!o || !isTrack(o)) return null;
    const g = o.geometry;
    const e = this.env.engine;
    if (g.kind === 'line') {
      return which === 'end'
        ? lineBetween(g.start, target)
        : lineBetween(target, e.endPose(g).point);
    }
    if (which === 'start') return e.translate(g, target[0] - g.start[0], target[1] - g.start[1]);
    const c = e.arcCenter(g);
    if (!c) return null;
    const a0 = Math.atan2(g.start[1] - c[1], g.start[0] - c[0]);
    const a1 = Math.atan2(target[1] - c[1], target[0] - c[0]);
    const twoPi = 2 * Math.PI;
    const raw = (a1 - a0) * Math.sign(g.signedRadiusM);
    const sweep = ((raw % twoPi) + twoPi) % twoPi;
    if (Math.abs(g.signedRadiusM) * sweep < TOLERANCES.minSegmentLengthM) return null;
    return { ...g, sweepRad: sweep };
  }
}
