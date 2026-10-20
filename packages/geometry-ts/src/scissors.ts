import {
  TURNOUT_CATALOG_REVISION,
  type LineGeometry,
  type TurnoutType,
  type Vec2,
} from '@railcad/domain';
import type {
  AssemblyLink,
  AssemblyPart,
  AssemblyPlan,
  ScissorsInput,
} from '@railcad/geometry-api';
import { turnoutLayout } from './turnout';
import { add, rotate } from './vec';

/**
 * Sovitet sporkryss (SRR) i lokalt system: M i origo, sporene langs +X i y = ∓s/2.
 * Fire veksler (T1–T4), et kryss med vinkel 2α, fire diagonale spor (rette, vinkel ±α) og to
 * gjennomgående spor mellom vekslenes stamspor ut. Se docs/sporkryss-sovitet.md.
 */
export function scissorsPlan(type: TurnoutType, input: ScissorsInput): AssemblyPlan {
  const { spacingM: s, crossingHalfLengthM: h } = input;
  if (!(s > 0 && Number.isFinite(s)))
    return { ok: false, error: 'Sporavstanden må være et positivt tall.' };
  if (!(h > 0 && h <= 1e4))
    return { ok: false, error: 'Lengden fra M til krysset-enden må være mellom 0 og 10 000 m.' };

  const alpha = Math.atan(1 / type.ratioN);
  const half = s / 2;
  const base = turnoutLayout(type, {
    catalogId: type.catalogId,
    catalogRevision: TURNOUT_CATALOG_REVISION,
    position: [0, 0],
    headingRad: 0,
    hand: 'left',
  });
  const [lx, ly] = base.ports.diverging_out.point as [number, number];
  const stemL = base.ports.stem_out.point[0];

  // T1 på spor 1 (y = −s/2), avvik mot venstre. Diagonalen fra avvik-ut må gå gjennom M med retning α:
  //   D1y = D1x·tanα  der D1 = (x1 + lx, ly − s/2)  ⇒  x1 = (ly − s/2)/tanα − lx.
  const x1 = (ly - half) / Math.tan(alpha) - lx;
  const d1: Vec2 = [x1 + lx, ly - half];
  const dir = [Math.cos(alpha), Math.sin(alpha)] as const;
  const t = -h - (d1[0] * dir[0] + d1[1] * dir[1]); // rett diagonal mellom avvik-ut og kryssets ende
  const minSpacing = 2 * (ly + h * Math.sin(alpha));
  if (t < 1e-6) {
    return {
      ok: false,
      error: `Sporavstanden er for liten for denne vekseltypen og kryss-lengden. Minste sporavstand er ${minSpacing.toFixed(3)} m.`,
    };
  }
  const through = -2 * (x1 + stemL); // gjennomgående spor mellom T1 og T3 sine stamspor ut
  if (through < 1e-6) {
    return {
      ok: false,
      error:
        'Vekslene overlapper hverandre på samme spor. Øk sporavstanden eller bruk en kortere veksel.',
    };
  }

  const placement = (hand: 'left' | 'right', position: Vec2, headingRad: number) => ({
    catalogId: type.catalogId,
    catalogRevision: TURNOUT_CATALOG_REVISION,
    position,
    headingRad,
    hand,
  });
  const line = (start: Vec2, headingRad: number, lengthM: number): LineGeometry => ({
    kind: 'line',
    start,
    headingRad,
    lengthM,
  });

  const local: AssemblyPart[] = [
    { key: 'T1', kind: 'turnout', turnout: placement('left', [x1, -half], 0) },
    { key: 'T4', kind: 'turnout', turnout: placement('right', [x1, half], 0) },
    { key: 'T2', kind: 'turnout', turnout: placement('left', [-x1, half], Math.PI) },
    { key: 'T3', kind: 'turnout', turnout: placement('right', [-x1, -half], Math.PI) },
    {
      key: 'X',
      kind: 'crossing',
      crossing: {
        position: [0, 0],
        headingRad: -alpha,
        ratioN: 1 / Math.tan(2 * alpha),
        halfLengthM: h,
      },
    },
    { key: 'd1', kind: 'track', track: line(d1, alpha, t) },
    { key: 'd4', kind: 'track', track: line([d1[0], -d1[1]], -alpha, t) },
    { key: 'd2', kind: 'track', track: line([-d1[0], -d1[1]], Math.PI + alpha, t) },
    { key: 'd3', kind: 'track', track: line([-d1[0], d1[1]], Math.PI - alpha, t) },
    { key: 'g1', kind: 'track', track: line([x1 + stemL, -half], 0, through) },
    { key: 'g2', kind: 'track', track: line([x1 + stemL, half], 0, through) },
  ];
  const links: AssemblyLink[] = [
    { a: { key: 'T1', port: 'diverging_out' }, b: { key: 'd1', port: 'start' } },
    { a: { key: 'd1', port: 'end' }, b: { key: 'X', port: 'b_start' } },
    { a: { key: 'T4', port: 'diverging_out' }, b: { key: 'd4', port: 'start' } },
    { a: { key: 'd4', port: 'end' }, b: { key: 'X', port: 'a_start' } },
    { a: { key: 'T2', port: 'diverging_out' }, b: { key: 'd2', port: 'start' } },
    { a: { key: 'd2', port: 'end' }, b: { key: 'X', port: 'b_end' } },
    { a: { key: 'T3', port: 'diverging_out' }, b: { key: 'd3', port: 'start' } },
    { a: { key: 'd3', port: 'end' }, b: { key: 'X', port: 'a_end' } },
    { a: { key: 'T1', port: 'stem_out' }, b: { key: 'g1', port: 'start' } },
    { a: { key: 'g1', port: 'end' }, b: { key: 'T3', port: 'stem_out' } },
    { a: { key: 'T4', port: 'stem_out' }, b: { key: 'g2', port: 'start' } },
    { a: { key: 'g2', port: 'end' }, b: { key: 'T2', port: 'stem_out' } },
  ];

  // Til prosjektkoordinater: roter om origo og flytt til M.
  const h0 = input.headingRad;
  const place = (p: Vec2): Vec2 => add(rotate(p, h0), input.position);
  const parts = local.map((p): AssemblyPart => {
    if (p.turnout) {
      return {
        ...p,
        turnout: {
          ...p.turnout,
          position: place(p.turnout.position),
          headingRad: p.turnout.headingRad + h0,
        },
      };
    }
    if (p.crossing) {
      return {
        ...p,
        crossing: {
          ...p.crossing,
          position: place(p.crossing.position),
          headingRad: p.crossing.headingRad + h0,
        },
      };
    }
    const g = p.track as LineGeometry;
    return { ...p, track: { ...g, start: place(g.start), headingRad: g.headingRad + h0 } };
  });
  return {
    ok: true,
    parts,
    links,
    freePorts: [
      { key: 'T1', port: 'stem_in' },
      { key: 'T4', port: 'stem_in' },
      { key: 'T2', port: 'stem_in' },
      { key: 'T3', port: 'stem_in' },
    ],
  };
}
