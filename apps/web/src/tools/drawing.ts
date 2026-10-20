import type { TrackGeometry, Vec2 } from '@railcad/domain';
import { TOLERANCES } from '@railcad/geometry-api';
import { fmt, fmtDeg, fmtM, radToDeg } from '../format';
import { Tool, lineBetween, type KeyInfo } from './tool';
import type { PointerInfo } from './types';
import { isTrack } from '@railcad/domain';

export class LineTool extends Tool {
  readonly id = 'line' as const;
  readonly label = 'Rett spor';
  private start: Vec2 | null = null;

  hint() {
    return this.start
      ? 'Klikk sluttpunkt. Esc avbryter.'
      : 'Klikk startpunkt for rett spor (eller bruk skjemaet for numerisk inntasting).';
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    if (!this.start) {
      this.start = p.point;
      return;
    }
    const g = lineBetween(this.start, p.point);
    if (!g) {
      this.env.ui.notify('Sporet er for kort – velg et sluttpunkt lenger fra startpunktet.', 'error');
      return;
    }
    this.env.project.addTrack(g);
    this.reset();
  }

  move(p: PointerInfo) {
    if (!this.start) return;
    const g = lineBetween(this.start, p.point);
    this.env.setPreview({
      ghosts: g ? [{ geometry: g, valid: true }] : [],
      hud: g ? [`L = ${fmtM(g.lengthM)}`, `α = ${fmtDeg(g.headingRad)}`] : ['For kort'],
      hudValid: !!g,
    });
  }

  cancel() {
    if (!this.start) return false;
    this.reset();
    return true;
  }

  private reset() {
    this.start = null;
    this.env.setPreview(null);
  }
}

/**
 * Tangentbue i tre faser: startpunkt → (tangentretning) → sluttpunkt.
 * Starter buen i et sporendepunkt, fortsetter den tangentielt fra sporet og fase 2 hoppes over.
 */
export class ArcTool extends Tool {
  readonly id = 'arc' as const;
  readonly label = 'Sirkelkurve';
  private stage: 0 | 1 | 2 = 0;
  private start: Vec2 | null = null;
  private heading = 0;
  private fromTrack: string | null = null;

  hint() {
    if (this.stage === 0) return 'Klikk startpunkt. Start i et sporendepunkt for tangentiell fortsettelse.';
    if (this.stage === 1) return 'Klikk for å angi starttangentens retning. Esc avbryter.';
    return 'Klikk sluttpunkt – radius og sveip følger av start, tangent og sluttpunkt.';
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    if (this.stage === 0) {
      this.start = p.point;
      this.fromTrack = null;
      const tangent = p.snap?.kind === 'endpoint' ? this.tangentAt(p) : null;
      if (tangent !== null) {
        this.heading = tangent;
        this.stage = 2;
      } else {
        this.stage = 1;
      }
      this.snapReference = this.start;
    } else if (this.stage === 1 && this.start) {
      const g = lineBetween(this.start, p.point);
      if (!g) {
        this.env.ui.notify('Retningen er udefinert – klikk et punkt lenger fra startpunktet.', 'error');
        return;
      }
      this.heading = g.headingRad;
      this.stage = 2;
    } else if (this.stage === 2 && this.start) {
      const arc = this.env.engine.arcFromStartTangentEnd(this.start, this.heading, p.point);
      if (!arc) {
        this.env.ui.notify('Ugyldig bue: sluttpunktet ligger på tangentlinjen eller gir for stor radius.', 'error');
        return;
      }
      this.env.project.addTrack(arc);
      this.reset();
    }
  }

  move(p: PointerInfo) {
    if (!this.start) return;
    if (this.stage === 1) {
      const g = lineBetween(this.start, p.point);
      this.env.setPreview({
        ghosts: [],
        guides: g ? [[this.start, p.point]] : [],
        hud: g ? [`Tangent α = ${fmtDeg(g.headingRad)}`] : [],
        hudValid: true,
      });
      return;
    }
    const arc = this.env.engine.arcFromStartTangentEnd(this.start, this.heading, p.point);
    const reach = Math.max(50, Math.hypot(p.point[0] - this.start[0], p.point[1] - this.start[1]));
    const tangentEnd: Vec2 = [
      this.start[0] + Math.cos(this.heading) * reach,
      this.start[1] + Math.sin(this.heading) * reach,
    ];
    this.env.setPreview({
      ghosts: arc ? [{ geometry: arc, valid: true }] : [],
      guides: [[this.start, tangentEnd]],
      hud: arc && arc.kind === 'arc'
        ? [
            ...(this.fromTrack ? [`Tangentiell fortsettelse fra ${this.fromTrack}`] : []),
            `R = ${fmtM(Math.abs(arc.signedRadiusM))} (${arc.signedRadiusM > 0 ? 'venstre' : 'høyre'})`,
            `Δ = ${fmt(radToDeg(arc.sweepRad), 3)}°`,
            `L = ${fmtM(this.env.engine.length(arc))}`,
          ]
        : ['Ugyldig bue'],
      hudValid: !!arc,
    });
  }

  key(_k: KeyInfo) {
    return false;
  }

  cancel() {
    if (this.stage === 0) return false;
    this.reset();
    return true;
  }

  private reset() {
    this.stage = 0;
    this.start = null;
    this.fromTrack = null;
    this.snapReference = undefined;
    this.env.setPreview(null);
  }

  /** Utgående retning når buen starter i et sporendepunkt. */
  private tangentAt(p: PointerInfo): number | null {
    const obj = p.snap?.objectId ? this.env.project.byId.get(p.snap.objectId) : undefined;
    if (!obj || !isTrack(obj)) return null;
    const g: TrackGeometry = obj.geometry;
    const eng = this.env.engine;
    const tol = TOLERANCES.coincidentPointM * 10;
    const near = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
    const end = eng.endPose(g);
    if (near(p.point, end.point)) {
      this.fromTrack = obj.id;
      return end.headingRad;
    }
    if (near(p.point, g.start)) {
      this.fromTrack = obj.id;
      return g.headingRad + Math.PI;
    }
    return null;
  }
}
