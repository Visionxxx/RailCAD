import { describe, expect, it } from 'vitest';
import { TURNOUT_CATALOG, getTurnoutType, type TurnoutPlacement } from '@railcad/domain';
import { geometryEngine as e } from '../src';

const at = (hand: 'left' | 'right', x = 0, y = 0, h = 0): TurnoutPlacement => ({
  catalogId: '',
  catalogRevision: '',
  position: [x, y],
  headingRad: h,
  hand,
});

describe('sporvekselbibliotek (TRV-hovedmål)', () => {
  it.each(TURNOUT_CATALOG.map((t) => [t.catalogId, t] as const))(
    '%s: hovedmålene er innbyrdes konsistente (B = C + D, L ≈ A + B, A = C = R·tan(α/2))',
    (_id, t) => {
      const m = t.mainDimensionsMm;
      expect(m.B).toBe(m.C + (m.D ?? 0));
      expect(Math.abs(m.L - (m.A + m.B))).toBeLessThanOrEqual(1);
      const alpha = Math.atan(1 / t.ratioN);
      const tangentMm = t.radiusM * Math.tan(alpha / 2) * 1000;
      expect(Math.abs(m.A - tangentMm)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(m.C - tangentMm)).toBeLessThanOrEqual(1.5);
    },
  );

  it('alle typer har kilde, tegningsnummer og er merket delvis verifisert', () => {
    for (const t of TURNOUT_CATALOG) {
      expect(t.verification).toBe('partial');
      expect(t.source.drawing).toMatch(/^KO-\d+$/);
      expect(t.source.url).toContain('trv.banenor.no');
    }
    expect(getTurnoutType('finnes-ikke')).toBeUndefined();
  });
});

describe('sporvekselgeometri', () => {
  const t = getTurnoutType('trv-54E3-1:9-R190-kort')!; // D = 6093 mm
  const flat = getTurnoutType('trv-60E1-1:9-R300-EVF')!; // D = –

  it('stamspor er rett fra SS med byggelengde L; avvik er bue + rett parti D', () => {
    const l = e.turnoutLayout(t, at('left'));
    expect(l.segments).toHaveLength(3);
    expect(l.segments[0]).toMatchObject({ kind: 'line', start: [0, 0], lengthM: 27.139 });
    expect(l.segments[1]).toMatchObject({ kind: 'arc', signedRadiusM: 190 });
    expect(l.segments[2]).toMatchObject({ kind: 'line', lengthM: 6.093 });
    expect(e.turnoutLayout(flat, at('left')).segments).toHaveLength(2); // ingen D
  });

  it('avviksbuen dreier vinkelen atan(1/n) og avviket fortsetter tangentielt', () => {
    const l = e.turnoutLayout(t, at('left'));
    const alpha = Math.atan(1 / 9);
    const arc = l.segments[1]!;
    expect(arc.kind === 'arc' && arc.sweepRad).toBeCloseTo(alpha, 12);
    const arcEnd = e.endPose(arc);
    expect(arcEnd.headingRad).toBeCloseTo(alpha, 12);
    expect(l.segments[2]!.start[0]).toBeCloseTo(arcEnd.point[0], 12);
    expect(l.ports.diverging_out.headingRad).toBeCloseTo(alpha, 12);
    // Krysset (TK) ligger A fra SS langs stamsporet: avvikets tangenter møtes der.
    const tk = t.mainDimensionsMm.A / 1000;
    const dx = arcEnd.point[0] - tk;
    const dy = arcEnd.point[1];
    expect(Math.hypot(dx, dy)).toBeCloseTo(t.mainDimensionsMm.C / 1000, 2); // C etter TK langs tangenten
  });

  it('høyreveksel speiler venstreveksel', () => {
    const left = e.turnoutLayout(t, at('left'));
    const right = e.turnoutLayout(t, at('right'));
    expect(right.ports.diverging_out.point[0]).toBeCloseTo(left.ports.diverging_out.point[0], 12);
    expect(right.ports.diverging_out.point[1]).toBeCloseTo(-left.ports.diverging_out.point[1], 12);
    expect(right.ports.diverging_out.headingRad).toBeCloseTo(
      -left.ports.diverging_out.headingRad,
      12,
    );
  });

  it('porter: stamspor inn (utgående = bakover), stamspor ut og avvik ut', () => {
    const l = e.turnoutLayout(flat, at('left'));
    expect(l.ports.stem_in.point).toEqual([0, 0]);
    expect(l.ports.stem_in.headingRad).toBeCloseTo(Math.PI, 12);
    expect(l.ports.stem_out.point[0]).toBeCloseTo(33.23, 9);
    expect(l.ports.stem_out.headingRad).toBe(0);
  });

  it('plassering og rotasjon transformerer uten å endre mål', () => {
    const base = e.turnoutLayout(t, at('left'));
    const moved = e.turnoutLayout(t, at('left', 100, 50, Math.PI / 2));
    expect(moved.ports.stem_in.point).toEqual([100, 50]);
    expect(moved.ports.stem_out.point[0]).toBeCloseTo(100, 9);
    expect(moved.ports.stem_out.point[1]).toBeCloseTo(50 + 27.139, 9);
    moved.segments.forEach((seg, i) =>
      expect(e.length(seg)).toBeCloseTo(e.length(base.segments[i]!), 12),
    );
    expect(moved.ports.diverging_out.headingRad).toBeCloseTo(Math.PI / 2 + Math.atan(1 / 9), 12);
  });
});
