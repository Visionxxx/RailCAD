import type { CrossingPlacement, Vec2 } from '@railcad/domain';
import { TOLERANCES, type PortRef } from '@railcad/geometry-api';
import { slipTangentM } from '../crossing-labels';
import { fmt, fmtDeg } from '../format';
import { cachedCrossingLayout } from '../rendering/crossings';
import { Tool } from './tool';
import type { PointerInfo } from './types';

/**
 * Plasserer et sporkryss (diamantkryss). Krysningsforholdet 1:n og lengden fra M til hver ende
 * angis i verktøylinjen – de er brukerdefinert (ingen åpne norske produktmål), og objektet er
 * alltid «ikke verifisert».
 * - Klikk på et ledig sporendepunkt: spor A starter der i forlengelsen og kobles automatisk.
 * - Klikk på et fritt punkt (midtpunktet M), deretter retningen på spor A.
 */
/**
 * Plassering fra verktøyparametrene. Gir `error` hvis forhold, lengde eller kryssveksel-radius er ugyldig
 * (tangentlengden R·tan(α/2) må rekke innenfor lengden fra M til enden).
 */
export function crossingFromView(
  view: {
    crossingRatioN: number;
    crossingHalfLengthM: number;
    crossingSlip: 'none' | 'ab' | 'ba' | 'both';
    crossingSlipRadiusM: number;
  },
  position: Vec2,
  headingRad: number,
): { ok: true; placement: CrossingPlacement } | { ok: false; error: string } {
  const { crossingRatioN: ratioN, crossingHalfLengthM: halfLengthM } = view;
  if (!(ratioN >= 1.5 && ratioN <= 100))
    return { ok: false, error: 'Krysningsforholdet 1:n må ha n mellom 1,5 og 100.' };
  if (!(halfLengthM > 0 && halfLengthM <= 1e4))
    return { ok: false, error: 'Lengden fra M til enden må være mellom 0 og 10 000 m.' };
  const placement: CrossingPlacement = { position, headingRad, ratioN, halfLengthM };
  if (view.crossingSlip !== 'none') {
    const radiusM = view.crossingSlipRadiusM;
    if (!(radiusM > 0 && radiusM <= 1e5))
      return { ok: false, error: 'Radius må være mellom 0 og 100 000 m.' };
    const t = slipTangentM(ratioN, radiusM);
    if (t > halfLengthM) {
      return {
        ok: false,
        error: `Tangentlengden R·tan(α/2) = ${fmt(t, 2)} m er lengre enn lengden fra M til enden (${fmt(halfLengthM, 2)} m). Øk lengden eller reduser radius.`,
      };
    }
    placement.slip = { arcs: view.crossingSlip, radiusM };
  }
  return { ok: true, placement };
}

export class CrossingTool extends Tool {
  readonly id = 'crossing' as const;
  readonly label = 'Sporkryss';
  private pos: Vec2 | null = null;

  hint() {
    return this.pos
      ? 'Klikk for retningen på spor A. Esc avbryter.'
      : 'Klikk et ledig sporendepunkt (kobles automatisk) eller midtpunktet M. Forhold og lengde settes i verktøylinjen.';
  }

  down(p: PointerInfo) {
    if (p.button !== 0) return;
    if (!this.pos) {
      const free = this.freePortAt(p);
      if (free) {
        // Spor A starter i porten: M ligger halvLengde foran den.
        const half = this.env.view.crossingHalfLengthM;
        const m: Vec2 = [
          free.point[0] + Math.cos(free.headingRad) * half,
          free.point[1] + Math.sin(free.headingRad) * half,
        ];
        this.place(m, free.headingRad, { objectId: free.objectId, port: free.port });
        return;
      }
      this.pos = p.point;
      this.snapReference = p.point;
      return;
    }
    const d = [p.point[0] - this.pos[0], p.point[1] - this.pos[1]] as const;
    if (Math.hypot(d[0], d[1]) < TOLERANCES.minSegmentLengthM) {
      this.env.ui.notify('Retningen er udefinert – klikk et punkt lenger fra M.', 'error');
      return;
    }
    this.place(this.pos, Math.atan2(d[1], d[0]));
  }

  move(p: PointerInfo) {
    let m: Vec2;
    let heading: number;
    if (this.pos) {
      m = this.pos;
      heading = Math.atan2(p.point[1] - m[1], p.point[0] - m[0]);
    } else {
      const free = this.freePortAt(p);
      heading = free ? free.headingRad : 0;
      m = free
        ? [
            free.point[0] + Math.cos(heading) * this.env.view.crossingHalfLengthM,
            free.point[1] + Math.sin(heading) * this.env.view.crossingHalfLengthM,
          ]
        : p.point;
    }
    const placement = this.placementAt(m, heading);
    this.env.setPreview({
      ghosts: placement
        ? cachedCrossingLayout({ id: '', type: 'crossing', crossing: placement }).segments.map(
            (geometry) => ({ geometry, valid: true }),
          )
        : [],
      hud: [placement ? `α = ${fmtDeg(heading)}` : 'Ugyldig forhold/lengde'],
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

  private placementAt(position: Vec2, headingRad: number): CrossingPlacement | null {
    const r = crossingFromView(this.env.view, position, headingRad);
    return r.ok ? r.placement : null;
  }

  private place(position: Vec2, headingRad: number, anchor?: PortRef) {
    const placement = this.placementAt(position, headingRad);
    if (!placement) {
      this.env.ui.notify(
        'Angi gyldig krysningsforhold (1,5–100) og lengde i verktøylinjen.',
        'error',
      );
      return;
    }
    this.env.project.addCrossing(placement, anchor);
    this.pos = null;
    this.snapReference = undefined;
    this.env.setPreview(null);
  }

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
