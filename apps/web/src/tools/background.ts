import { scaleAboutPoint, translatePlacement, type Vec2 } from '@railcad/domain';
import { fmt, fmtM } from '../format';
import { snapToBackground } from '../rendering/background';
import { Tool } from './tool';
import type { PointerInfo } from './types';

/** Felles: bakgrunnsverktøyene virker på valgt bakgrunn og kan snappe til DXF-bakgrunnens hjørner. */
abstract class BackgroundTool extends Tool {
  /** Snapper også mot hjørner/endepunkter i synlige DXF-bakgrunner (i tillegg til spor og rutenett). */
  extraSnap(world: Vec2, tolM: number): Vec2 | null {
    return snapToBackground(this.env.project.backgrounds, world, tolM);
  }

  protected active() {
    const id = this.env.view.activeBackgroundId;
    return this.env.project.backgrounds.find((b) => b.id === id) ?? null;
  }

  activate() {
    if (!this.active()) {
      this.env.ui.notify('Velg en bakgrunn i bakgrunnspanelet først.');
      this.env.setTool('select');
    }
  }
}

/**
 * Skaler bakgrunn: klikk to punkter på kartet og oppgi virkelig avstand mellom dem.
 * Skaleringen skjer om det første punktet, som blir stående.
 */
export class BackgroundScaleTool extends BackgroundTool {
  readonly id = 'bg-scale' as const;
  readonly label = 'Skaler bakgrunn';
  private p1: Vec2 | null = null;
  private p2: Vec2 | null = null;

  /** 0 = første punkt, 1 = andre punkt, 2 = venter på kjent avstand. */
  get stage(): 0 | 1 | 2 {
    return this.p2 ? 2 : this.p1 ? 1 : 0;
  }
  /** Avstand målt på kartet med nåværende skala (meter). */
  get measuredM(): number {
    return this.p1 && this.p2 ? Math.hypot(this.p2[0] - this.p1[0], this.p2[1] - this.p1[1]) : 0;
  }

  hint() {
    if (this.stage === 0) return 'Klikk første punkt på kartet (to punkter med kjent avstand).';
    if (this.stage === 1) return 'Klikk andre punkt. Esc avbryter.';
    return `Målt ${fmtM(this.measuredM)}. Skriv inn virkelig avstand i verktøylinjen.`;
  }

  down(p: PointerInfo) {
    if (p.button !== 0 || this.stage === 2) return;
    if (!this.p1) {
      this.p1 = p.point;
      return;
    }
    if (Math.hypot(p.point[0] - this.p1[0], p.point[1] - this.p1[1]) < 1e-6) {
      this.env.ui.notify('Punktene er sammenfallende – velg to ulike punkter.', 'error');
      return;
    }
    this.p2 = p.point;
    this.env.setPreview({ ghosts: [], guides: [[this.p1, this.p2]] });
  }

  move(p: PointerInfo) {
    if (!this.p1 || this.p2) return;
    const d = Math.hypot(p.point[0] - this.p1[0], p.point[1] - this.p1[1]);
    this.env.setPreview({
      ghosts: [],
      guides: [[this.p1, p.point]],
      hud: [`Målt ${fmtM(d)}`],
      hudValid: d > 0,
    });
  }

  /** Bruker oppgitt virkelig avstand (meter) mellom de to punktene. */
  apply(actualM: number): boolean {
    const bg = this.active();
    if (!bg || !this.p1 || !this.p2) return false;
    if (!(Number.isFinite(actualM) && actualM > 0)) {
      this.env.ui.notify('Avstanden må være et positivt tall.', 'error');
      return false;
    }
    const k = actualM / this.measuredM;
    const p1 = this.p1;
    this.env.project.updateBackground(
      bg.id,
      (b) => ({ ...b, placement: scaleAboutPoint(b.placement, p1, k) }),
      'Skaler bakgrunn',
    );
    const next = this.env.project.backgrounds.find((b) => b.id === bg.id);
    this.env.ui.notify(
      `Skalert med faktor ${fmt(k, 6)}. Ny skala: ${fmt(next?.placement.scaleMPerUnit ?? 0, 6)} m per enhet.`,
    );
    this.reset();
    this.env.setTool('select');
    return true;
  }

  cancel() {
    if (!this.p1) return false;
    this.reset();
    return true;
  }

  private reset() {
    this.p1 = this.p2 = null;
    this.env.setPreview(null);
  }
}

/** Flytt bakgrunn: klikk et punkt på kartet, deretter hvor punktet skal ligge (snapper mot spor). */
export class BackgroundMoveTool extends BackgroundTool {
  readonly id = 'bg-move' as const;
  readonly label = 'Flytt bakgrunn';
  private from: Vec2 | null = null;

  hint() {
    return this.from
      ? 'Klikk der punktet skal ligge (f.eks. et sporendepunkt). Esc avbryter.'
      : 'Klikk et punkt på kartet som skal flyttes.';
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    if (!this.from) {
      this.from = p.point;
      return;
    }
    const bg = this.active();
    if (!bg) return;
    const dx = p.point[0] - this.from[0];
    const dy = p.point[1] - this.from[1];
    this.env.project.updateBackground(
      bg.id,
      (b) => ({ ...b, placement: translatePlacement(b.placement, dx, dy) }),
      'Flytt bakgrunn',
    );
    this.reset();
    this.env.setTool('select');
  }

  move(p: PointerInfo) {
    if (!this.from) return;
    this.env.setPreview({
      ghosts: [],
      guides: [[this.from, p.point]],
      hud: [`Δx = ${fmtM(p.point[0] - this.from[0])}`, `Δy = ${fmtM(p.point[1] - this.from[1])}`],
      hudValid: true,
    });
  }

  cancel() {
    if (!this.from) return false;
    this.reset();
    return true;
  }

  private reset() {
    this.from = null;
    this.env.setPreview(null);
  }
}
