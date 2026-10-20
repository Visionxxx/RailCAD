import { getTurnoutType, type Vec2 } from '@railcad/domain';
import { TOLERANCES } from '@railcad/geometry-api';
import { fmtDeg } from '../format';
import { cachedCrossingLayout } from '../rendering/crossings';
import { cachedTurnoutLayout } from '../rendering/turnouts';
import { Tool } from './tool';
import type { PointerInfo } from './types';

/**
 * Sovitet sporkryss: klikk midtpunktet M og deretter sporenes retning. Veksltype, sporavstand og
 * midtkryssets lengde settes i verktøylinjen. Oppretter 4 veksler, kryss og 6 spor – koblet – som
 * ett angretrinn. Vekslene er delvis verifisert; krysset er brukerdefinert (ikke verifisert).
 */
export class ScissorsTool extends Tool {
  readonly id = 'scissors' as const;
  readonly label = 'Sovitet sporkryss';
  private pos: Vec2 | null = null;

  hint() {
    return this.pos
      ? 'Klikk for sporenes retning. Esc avbryter.'
      : 'Klikk midtpunktet M for det sovitete sporkrysset. Veksltype og mål settes i verktøylinjen.';
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    if (!this.pos) {
      this.pos = p.point;
      this.snapReference = p.point;
      return;
    }
    const d = [p.point[0] - this.pos[0], p.point[1] - this.pos[1]] as const;
    if (Math.hypot(d[0], d[1]) < TOLERANCES.minSegmentLengthM) {
      this.env.ui.notify('Retningen er udefinert – klikk et punkt lenger fra M.', 'error');
      return;
    }
    this.create(this.pos, Math.atan2(d[1], d[0]));
  }

  move(p: PointerInfo) {
    const m = this.pos ?? p.point;
    const heading = this.pos ? Math.atan2(p.point[1] - m[1], p.point[0] - m[0]) : 0;
    const plan = this.plan(m, heading);
    if (!plan.ok) {
      this.env.setPreview({ ghosts: [], hud: [plan.error], hudValid: false });
      return;
    }
    const ghosts = [];
    for (const part of plan.parts) {
      if (part.track) ghosts.push({ geometry: part.track, valid: true });
      else if (part.turnout) {
        const l = cachedTurnoutLayout({ id: '', type: 'turnout', turnout: part.turnout });
        for (const g of l?.segments ?? []) ghosts.push({ geometry: g, valid: true });
      } else if (part.crossing) {
        for (const g of cachedCrossingLayout({ id: '', type: 'crossing', crossing: part.crossing })
          .segments) {
          ghosts.push({ geometry: g, valid: true });
        }
      }
    }
    this.env.setPreview({ ghosts, hud: [`α = ${fmtDeg(heading)}`], hudValid: true });
  }

  cancel() {
    if (!this.pos) return false;
    this.pos = null;
    this.snapReference = undefined;
    this.env.setPreview(null);
    return true;
  }

  private plan(position: Vec2, headingRad: number) {
    const type = getTurnoutType(this.env.view.scissorsTurnoutId);
    if (!type) return { ok: false as const, error: 'Velg en veksltype i verktøylinjen.' };
    return this.env.engine.scissorsPlan(type, {
      position,
      headingRad,
      spacingM: this.env.view.scissorsSpacingM,
      crossingHalfLengthM: this.env.view.scissorsHalfLengthM,
    });
  }

  private create(position: Vec2, headingRad: number) {
    const plan = this.plan(position, headingRad);
    if (!plan.ok) {
      this.env.ui.notify(plan.error, 'error');
      return;
    }
    this.env.project.addAssembly(plan, 'Plasser sovitet sporkryss');
    this.pos = null;
    this.snapReference = undefined;
    this.env.setPreview(null);
  }
}
