import type { Vec2 } from '@railcad/domain';
import { TOLERANCES, type GeometryEngine } from '@railcad/geometry-api';
import type { useProjectStore } from '../stores/project';
import type { useUiStore } from '../stores/ui';
import type { useViewStore } from '../stores/view';
import type { PointerInfo, Preview, ToolId } from './types';

export interface ToolEnv {
  project: ReturnType<typeof useProjectStore>;
  view: ReturnType<typeof useViewStore>;
  ui: ReturnType<typeof useUiStore>;
  engine: GeometryEngine;
  setPreview(p: Preview | null): void;
  setTool(id: ToolId): void;
  openPortMenu(menu: PortMenuState): void;
  closePortMenu(): void;
}

export interface PortMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  note?: string;
}

export interface PortMenuState {
  /** Skjermposisjon (piksler i tegneflaten) menyen åpnes ved. */
  screen: Vec2;
  title: string;
  items: PortMenuItem[];
}

export interface KeyInfo {
  key: string;
  shift: boolean;
  ctrl: boolean;
}

export abstract class Tool {
  abstract readonly id: ToolId;
  abstract readonly label: string;
  cursor = 'crosshair';
  /** Referansepunkt for tangent-snap. */
  snapReference: Vec2 | undefined;
  /** Objekter som ikke skal snappes mot (f.eks. de som flyttes). */
  snapExclude: ReadonlySet<string> | undefined;
  /** Om snapping er aktiv akkurat nå. */
  snapEnabled = true;
  /** Ekstra snap-kilde (utenfor spor), brukt når ordinær snapping ikke treffer. */
  extraSnap?(world: Vec2, toleranceM: number): Vec2 | null;

  constructor(protected env: ToolEnv) {}

  /** Kort veiledning i bunnlinjen – avhenger av verktøyets fase. */
  abstract hint(): string;

  activate(): void {}
  deactivate(): void {
    this.cancel();
  }
  down(_p: PointerInfo): void {}
  move(_p: PointerInfo): void {}
  up(_p: PointerInfo): void {}
  /** Returnerer true hvis tasten ble håndtert. */
  key(_k: KeyInfo): boolean {
    return false;
  }
  /** Avbryter pågående kommando. Returnerer true hvis noe ble avbrutt. */
  cancel(): boolean {
    return false;
  }
}

/** Rett spor mellom to punkter, eller null hvis punktene er for nær hverandre. */
export function lineBetween(a: Vec2, b: Vec2) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthM = Math.hypot(dx, dy);
  if (lengthM < TOLERANCES.minSegmentLengthM) return null;
  return { kind: 'line' as const, start: a, headingRad: Math.atan2(dy, dx), lengthM };
}

/**
 * Låser retningen fra `start` til nærmeste multiplum av `stepRad` (f.eks. 15°) og projiserer
 * `point` på den. Brukes når Skift holdes under tegning (ortho/polar).
 */
export function lockAngle(start: Vec2, point: Vec2, stepRad = Math.PI / 12): Vec2 {
  const dx = point[0] - start[0];
  const dy = point[1] - start[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return point;
  const raw = Math.atan2(dy, dx);
  const locked = Math.round(raw / stepRad) * stepRad;
  const along = len * Math.cos(raw - locked);
  return [start[0] + along * Math.cos(locked), start[1] + along * Math.sin(locked)];
}
