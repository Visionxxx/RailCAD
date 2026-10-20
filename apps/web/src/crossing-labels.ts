import type { CrossingPlacement } from '@railcad/domain';
import { fmt } from './format';

/** Navn på objektet: sporkryss eller (enkel/dobbel) kryssveksel, med forhold og evt. radius. */
export function crossingTitle(c: CrossingPlacement): string {
  const ratio = `1:${fmt(c.ratioN, 1)}`;
  if (!c.slip) return `Sporkryss ${ratio}`;
  const kind =
    c.slip.arcs === 'both'
      ? 'Dobbel kryssveksel'
      : c.slip.arcs === 'ab'
        ? 'Enkel kryssveksel (A→B)'
        : 'Enkel kryssveksel (B→A)';
  return `${kind} ${ratio} R${fmt(c.slip.radiusM, 0)}`;
}

/** Tangentlengde R·tan(α/2) for en kryssveksel-bue (meter). */
export function slipTangentM(ratioN: number, radiusM: number): number {
  return radiusM * Math.tan(Math.atan(1 / ratioN) / 2);
}
