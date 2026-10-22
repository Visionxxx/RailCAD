import type { Vec2 } from './types';

/**
 * Referansebakgrunn (RC-013): DXF-geometri eller bilde (også gjengitt PDF) som tegnes under
 * sporplanen. Bakgrunner er referanse – de er ikke prosjekteringsgeometri og inngår ikke i
 * kontroller eller DXF-eksport.
 *
 * Innholdskoordinater → verden: p_verden = origin + R(rotasjon) · (skala · p_innhold).
 * DXF: innholdskoordinater er tegningens egne (Y opp). Bilde: piksler med origo nederst til venstre (Y opp).
 */

/** Kompakte primitiver (færre byte i prosjektfilen). Første tall etter typen er lag-indeksen. */
export type DxfPrim =
  | readonly ['L', number, number, number, number, number] // lag, x1, y1, x2, y2
  | readonly ['A', number, number, number, number, number, number] // lag, cx, cy, r, startGrader, sluttGrader (mot klokka)
  | readonly ['C', number, number, number, number] // lag, cx, cy, r
  | readonly ['P', number, 0 | 1, readonly number[]] // lag, lukket, flat liste x,y,bulge,x,y,bulge,…
  | readonly ['T', number, number, number, number, number, string]; // lag, x, y, høyde, rotasjonGrader, tekst

export interface BackgroundPlacement {
  origin: Vec2;
  /** Meter per innholdsenhet (DXF-enhet eller bildepiksel). */
  scaleMPerUnit: number;
  rotationRad: number;
  /** false = skalaen er ukjent/antatt og må settes av bruker (vises som advarsel). */
  scaleConfirmed: boolean;
}

interface BackgroundCommon {
  id: string;
  name: string;
  visible: boolean;
  /** 0–1. */
  opacity: number;
  placement: BackgroundPlacement;
}

export interface DxfBackground extends BackgroundCommon {
  kind: 'dxf';
  layers: Array<{ name: string; /** AutoCAD-fargenummer (ACI) */ color: number }>;
  prims: DxfPrim[];
  /** Enhet oppgitt i filen ($INSUNITS), f.eks. «meters», «millimeters» eller «unitless». */
  sourceUnits: string;
  extents: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface ImageBackground extends BackgroundCommon {
  kind: 'image';
  source: 'image' | 'pdf';
  /** `data:image/png;base64,…` eller `data:image/jpeg;base64,…` */
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

export type Background = DxfBackground | ImageBackground;

/** Grenser som holder prosjektfilen håndterlig. */
export const BACKGROUND_LIMITS = Object.freeze({
  maxImageDataUrlChars: 14 * 1024 * 1024,
  maxPrims: 400_000,
  maxImagePixelsPerSide: 8192,
});

export function backgroundToWorld(pl: BackgroundPlacement, p: Vec2): Vec2 {
  const c = Math.cos(pl.rotationRad) * pl.scaleMPerUnit;
  const s = Math.sin(pl.rotationRad) * pl.scaleMPerUnit;
  return [pl.origin[0] + c * p[0] - s * p[1], pl.origin[1] + s * p[0] + c * p[1]];
}

export function worldToBackground(pl: BackgroundPlacement, p: Vec2): Vec2 {
  const dx = p[0] - pl.origin[0];
  const dy = p[1] - pl.origin[1];
  const c = Math.cos(-pl.rotationRad) / pl.scaleMPerUnit;
  const s = Math.sin(-pl.rotationRad) / pl.scaleMPerUnit;
  return [c * dx - s * dy, s * dx + c * dy];
}

/** SVG-matrise (a b c d e f) for innhold → verden, i verdenssystemet med Y opp. */
export function backgroundMatrix(
  pl: BackgroundPlacement,
): [number, number, number, number, number, number] {
  const c = Math.cos(pl.rotationRad) * pl.scaleMPerUnit;
  const s = Math.sin(pl.rotationRad) * pl.scaleMPerUnit;
  return [c, s, -s, c, pl.origin[0], pl.origin[1]];
}

/** Skalerer om `fixed` (verdenspunkt) med faktor k – punktet blir stående. */
export function scaleAboutPoint(
  pl: BackgroundPlacement,
  fixed: Vec2,
  k: number,
): BackgroundPlacement {
  return {
    ...pl,
    scaleMPerUnit: pl.scaleMPerUnit * k,
    origin: [fixed[0] + (pl.origin[0] - fixed[0]) * k, fixed[1] + (pl.origin[1] - fixed[1]) * k],
    scaleConfirmed: true,
  };
}

export function translatePlacement(
  pl: BackgroundPlacement,
  dx: number,
  dy: number,
): BackgroundPlacement {
  return { ...pl, origin: [pl.origin[0] + dx, pl.origin[1] + dy] };
}

/** Innholdets rektangel (innholdsenheter). */
export function backgroundContentBounds(bg: Background) {
  return bg.kind === 'dxf' ? bg.extents : { minX: 0, minY: 0, maxX: bg.widthPx, maxY: bg.heightPx };
}

/** Verdenskoordinater til innholdets fire hjørner (kan være rotert). */
export function backgroundWorldCorners(bg: Background): Vec2[] {
  const b = backgroundContentBounds(bg);
  return (
    [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ] as Vec2[]
  ).map((p) => backgroundToWorld(bg.placement, p));
}

/** Enhetsfaktor (meter per enhet) fra DXF `$INSUNITS`. Null = ukjent/enhetsløs. */
export function metersPerDxfUnit(insunits: number | undefined): number | null {
  switch (insunits) {
    case 1:
      return 0.0254;
    case 2:
      return 0.3048;
    case 3:
      return 1609.344;
    case 4:
      return 0.001;
    case 5:
      return 0.01;
    case 6:
      return 1;
    case 7:
      return 1000;
    case 10:
      return 0.9144;
    default:
      return null;
  }
}

export const DXF_UNIT_NAMES: Record<number, string> = {
  0: 'unitless',
  1: 'inches',
  2: 'feet',
  3: 'miles',
  4: 'millimeters',
  5: 'centimeters',
  6: 'meters',
  7: 'kilometers',
  10: 'yards',
};
