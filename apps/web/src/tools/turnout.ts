import {
  TURNOUT_CATALOG_REVISION,
  getTurnoutType,
  type TurnoutPlacement,
  type Vec2,
} from '@railcad/domain';
import { TOLERANCES, type PortRef } from '@railcad/geometry-api';
import { fmtDeg } from '../format';
import { cachedTurnoutLayout } from '../rendering/turnouts';
import { Tool } from './tool';
import type { PointerInfo } from './types';

/**
 * Plasserer en sporveksel fra biblioteket (type og retning velges i verktøylinjen).
 * - Klikk på et ledig sporendepunkt: veksel plasseres i forlengelsen, stamspor inn kobles dit.
 * - Klikk på et fritt punkt, deretter klikk for stamsporets retning.
 */
export class TurnoutTool extends Tool {
  readonly id = 'turnout' as const;
  readonly label = 'Sporveksel';
  private pos: Vec2 | null = null;

  hint() {
    return this.pos
      ? 'Klikk for stamsporets retning. Esc avbryter.'
      : 'Klikk et ledig sporendepunkt (kobles automatisk) eller et fritt punkt. Typen velges i verktøylinjen.';
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    if (!this.pos) {
      const free = this.freePortAt(p);
      if (free) {
        this.place(free.point, free.headingRad, { objectId: free.objectId, port: free.port });
        return;
      }
      this.pos = p.point;
      this.snapReference = p.point;
      return;
    }
    const d = [p.point[0] - this.pos[0], p.point[1] - this.pos[1]] as const;
    if (Math.hypot(d[0], d[1]) < TOLERANCES.minSegmentLengthM) {
      this.env.ui.notify(
        'Retningen er udefinert – klikk et punkt lenger fra plasseringspunktet.',
        'error',
      );
      return;
    }
    this.place(this.pos, Math.atan2(d[1], d[0]));
  }

  move(p: PointerInfo) {
    let pos: Vec2;
    let heading: number;
    if (this.pos) {
      pos = this.pos;
      heading = Math.atan2(p.point[1] - pos[1], p.point[0] - pos[0]);
    } else {
      const free = this.freePortAt(p);
      pos = free ? free.point : p.point;
      heading = free ? free.headingRad : 0;
    }
    const placement = this.placementAt(pos, heading);
    const layout = placement ? this.layout(placement) : null;
    this.env.setPreview({
      ghosts: layout ? layout.segments.map((geometry) => ({ geometry, valid: true })) : [],
      hud: [placement ? `α = ${fmtDeg(heading)}` : 'Velg sporveksel-type'],
      hudValid: !!placement,
    });
  }

  cancel() {
    if (!this.pos) return false;
    this.pos = null;
    this.snapReference = undefined;
    this.env.setPreview(null);
    return true;
  }

  private placementAt(position: Vec2, headingRad: number): TurnoutPlacement | null {
    const type = getTurnoutType(this.env.view.turnoutTypeId);
    if (!type) return null;
    return {
      catalogId: type.catalogId,
      catalogRevision: TURNOUT_CATALOG_REVISION,
      position,
      headingRad,
      hand: this.env.view.turnoutHand,
    };
  }

  private layout(placement: TurnoutPlacement) {
    return cachedTurnoutLayout({ id: '', type: 'turnout', turnout: placement });
  }

  private place(position: Vec2, headingRad: number, anchor?: PortRef) {
    const placement = this.placementAt(position, headingRad);
    if (!placement) {
      this.env.ui.notify('Velg en sporveksel-type i verktøylinjen.', 'error');
      return;
    }
    this.env.project.addTurnout(placement, anchor);
    this.pos = null;
    this.snapReference = undefined;
    this.env.setPreview(null);
  }

  /** Ledig port ved det snappede punktet (sporendepunkt eller vekselport). */
  private freePortAt(p: PointerInfo) {
    if (p.snap?.kind !== 'endpoint') return null;
    const tol = TOLERANCES.coincidentPointM * 10;
    return (
      this.env.project.freePorts.find(
        (f) => Math.hypot(f.point[0] - p.point[0], f.point[1] - p.point[1]) <= tol,
      ) ?? null
    );
  }
}
