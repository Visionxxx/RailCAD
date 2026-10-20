import type { DimensionSpec, TrackGeometry, Vec2 } from '@railcad/domain';
import type { SnapResult } from '@railcad/geometry-api';

export interface PointerInfo {
  button: number;
  shift: boolean;
  /** Skjermposisjon relativt til tegneflaten. */
  screen: Vec2;
  /** Rå verdensposisjon under markøren. */
  world: Vec2;
  /** Aktivt snap-treff (kan være null). */
  snap: SnapResult | null;
  /** Snappet punkt hvis snap finnes, ellers rå posisjon. */
  point: Vec2;
}

export interface Ghost {
  geometry: TrackGeometry;
  valid: boolean;
}

/** Midlertidig tegning mens et verktøy arbeider – lagres aldri i modellen. */
export interface Preview {
  ghosts: Ghost[];
  dimensions?: Array<{ spec: DimensionSpec; targetGeometry?: TrackGeometry; valid: boolean }>;
  /** Strekede hjelpelinjer (verdenskoordinater). */
  guides?: Array<readonly [Vec2, Vec2]>;
  /** Fremhevet objekt under markøren. */
  hoverId?: string;
  hoverKind?: 'normal' | 'danger';
  pivot?: Vec2;
  /** Valgboks (verdenskoordinater). `crossing` = dratt mot venstre (alt som berøres velges). */
  rect?: { a: Vec2; b: Vec2; crossing: boolean };
  /** Ledig port under markøren (Koble-verktøyet). */
  portHover?: Vec2;
  /** Tekst ved markøren (mål mens man tegner). */
  hud?: string[];
  hudValid?: boolean;
}

export type ToolId =
  | 'select'
  | 'pan'
  | 'line'
  | 'arc'
  | 'parallel'
  | 'measure-length'
  | 'measure-distance'
  | 'rotate'
  | 'delete'
  | 'connect'
  | 'turnout'
  | 'crossing'
  | 'bg-scale'
  | 'bg-move';
