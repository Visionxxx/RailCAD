import DxfParser from 'dxf-parser';
import { BACKGROUND_LIMITS, DXF_UNIT_NAMES, metersPerDxfUnit, type DxfPrim } from '@railcad/domain';

/**
 * dxf-parser leser ikke ekstrusjonsretningen (normalen, koder 210–230) for CIRCLE. En sirkel med
 * normal (0,0,−1) er speilet om y-aksen, så vi trenger den for å plassere sentrum riktig.
 */
class CircleWithNormal {
  readonly ForEntityName = 'CIRCLE';
  parseEntity(scanner: any, curr: any) {
    const entity: Record<string, any> = { type: curr.value };
    curr = scanner.next();
    while (!scanner.isEOF()) {
      if (curr.code === 0) break;
      switch (curr.code) {
        case 8:
          entity.layer = curr.value;
          break;
        case 10:
          entity.center = { x: curr.value, y: 0, z: 0 };
          break;
        case 20:
          if (entity.center) entity.center.y = curr.value;
          break;
        case 30:
          if (entity.center) entity.center.z = curr.value;
          break;
        case 40:
          entity.radius = curr.value;
          break;
        case 60:
          entity.visible = curr.value === 0;
          break;
        case 230:
          entity.extrusionDirectionZ = curr.value;
          break;
        default:
          break;
      }
      curr = scanner.next();
    }
    return entity;
  }
}

/** Resultat av lesing av en DXF som referansebakgrunn. */
export interface DxfReadResult {
  layers: Array<{ name: string; color: number }>;
  /** Primitiver i innholdskoordinater relativt til `offset` (små tall, trygt for tegning). */
  prims: DxfPrim[];
  extents: { minX: number; minY: number; maxX: number; maxY: number };
  /** Kildekoordinatene til innholdets origo (utstrekningens nedre venstre hjørne). */
  offset: [number, number];
  insunits: number | undefined;
  unitName: string;
  /** Meter per DXF-enhet, eller null hvis enheten er ukjent (enhetsløs). */
  metersPerUnit: number | null;
  summary: {
    /** Antall leste primitiver per kilde-entitetstype. */
    read: Record<string, number>;
    /** Entitetstyper som ikke støttes og er hoppet over. */
    skipped: Record<string, number>;
    /** Antall kurver (SPLINE/ELLIPSE) som er forenklet til polylinjer. */
    simplified: number;
  };
}

export type DxfReadOutcome = { ok: true; result: DxfReadResult } | { ok: false; error: string };

type P2 = [number, number];
/** 2D-likhetstransform (skala + rotasjon + speiling) for blokkreferanser. */
interface Xf {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
const IDENT: Xf = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const apply = (m: Xf, p: P2): P2 => [m.a * p[0] + m.c * p[1] + m.e, m.b * p[0] + m.d * p[1] + m.f];
const compose = (outer: Xf, inner: Xf): Xf => ({
  a: outer.a * inner.a + outer.c * inner.b,
  b: outer.b * inner.a + outer.d * inner.b,
  c: outer.a * inner.c + outer.c * inner.d,
  d: outer.b * inner.c + outer.d * inner.d,
  e: outer.a * inner.e + outer.c * inner.f + outer.e,
  f: outer.b * inner.e + outer.d * inner.f + outer.f,
});
const det = (m: Xf) => m.a * m.d - m.b * m.c;
const isIdent = (m: Xf) => m === IDENT;
/** Bare rotasjon + lik, positiv skala bevarer buer som buer. */
function isSimilarity(m: Xf): boolean {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  return (
    det(m) > 0 &&
    Math.abs(sx - sy) < 1e-9 * Math.max(sx, 1) &&
    Math.abs(m.a * m.c + m.b * m.d) < 1e-9 * sx * sy
  );
}

const round = (n: number) => +n.toFixed(6);
const deg = (rad: number) => ((rad * 180) / Math.PI + 360) % 360;

/** Fjerner MTEXT-formateringskoder (\P → linjeskift, {\f…;tekst}, \U+XXXX beholdes som tegn). */
export function cleanMText(s: string): string {
  return s
    .replace(/\\P/g, ' ')
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sirkelbue (CCW, radianer) som punkter – brukes når buen ikke kan beholdes som bue. */
function arcPoints(c: P2, r: number, a0: number, a1: number): P2[] {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const n = Math.max(8, Math.ceil((sweep * 180) / Math.PI / 5));
  return Array.from({ length: n + 1 }, (_, i) => [
    c[0] + r * Math.cos(a0 + (sweep * i) / n),
    c[1] + r * Math.sin(a0 + (sweep * i) / n),
  ]);
}

/**
 * Leser DXF (R12 og nyere) til kompakte primitiver for bruk som bakgrunn. Støtter LINE, ARC, CIRCLE,
 * LWPOLYLINE, POLYLINE (med buer/bulge), TEXT, MTEXT og INSERT (blokker, rekursivt). SPLINE og
 * ELLIPSE forenkles til polylinjer; øvrige typer hoppes over og rapporteres i `summary`.
 */
export function readDxfBackground(text: string): DxfReadOutcome {
  let doc;
  try {
    const parser = new DxfParser();
    parser.registerEntityHandler(CircleWithNormal as never);
    doc = parser.parseSync(text);
  } catch (e) {
    return { ok: false, error: `Kunne ikke lese DXF: ${(e as Error).message}` };
  }
  if (!doc) return { ok: false, error: 'Filen ser ikke ut som en DXF.' };

  const layerNames: string[] = [];
  const layerColors: number[] = [];
  const layerIndex = new Map<string, number>();
  const hiddenLayers = new Set<string>();
  const tableLayers =
    (
      (doc.tables ?? {}) as {
        layer?: {
          layers?: Record<
            string,
            { name: string; colorIndex?: number; visible?: boolean; frozen?: boolean }
          >;
        };
      }
    ).layer?.layers ?? {};
  for (const l of Object.values(tableLayers)) {
    layerIndex.set(l.name, layerNames.length);
    layerNames.push(l.name);
    layerColors.push(Math.abs(l.colorIndex ?? 7));
    if (l.frozen || l.visible === false) hiddenLayers.add(l.name);
  }
  const layerOf = (name: string | undefined) => {
    const n = name ?? '0';
    let i = layerIndex.get(n);
    if (i === undefined) {
      i = layerNames.length;
      layerIndex.set(n, i);
      layerNames.push(n);
      layerColors.push(7);
    }
    return i;
  };

  const prims: DxfPrim[] = [];
  const read: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  let simplified = 0;
  const count = (rec: Record<string, number>, k: string) => (rec[k] = (rec[k] ?? 0) + 1);

  /** Avbryter importen når grensene overskrides – selv mens blokker ekspanderes (beskytter mot DXF-bomber). */
  class LimitError extends Error {}
  const MAX_WORK = 2_000_000;
  let work = 0;
  const add = (p: DxfPrim) => {
    if (prims.length >= BACKGROUND_LIMITS.maxPrims) throw new LimitError('prims');
    prims.push(p);
  };
  const pushPoly = (layer: number, pts: Array<P2 | [number, number, number]>, closed: boolean) => {
    if (pts.length < 2) return;
    const flat: number[] = [];
    for (const p of pts)
      flat.push(round(p[0]), round(p[1]), round((p as [number, number, number])[2] ?? 0));
    add(['P', layer, closed ? 1 : 0, flat]);
  };

  type Ent = Record<string, any>;
  const blocks = (doc.blocks ?? {}) as Record<
    string,
    { position?: { x: number; y: number }; entities?: Ent[] }
  >;

  /**
   * `inherit` = lagnavnet på INSERT-en som omslutter blokken. Entiteter på lag «0» i en blokk arver
   * INSERT-ens lag (AutoCAD-regelen), slik at f.eks. farge og synlighet blir riktig.
   */
  const handleRaw = (e: Ent, m: Xf, depth: number, inherit?: string) => {
    if (++work > MAX_WORK) throw new LimitError('work');
    const layerName: string = (e.layer ?? '0') === '0' && inherit ? inherit : (e.layer ?? '0');
    if (e.visible === false || hiddenLayers.has(layerName)) return;
    const layer = layerOf(layerName);
    const t = (p: { x: number; y: number }): P2 => (isIdent(m) ? [p.x, p.y] : apply(m, [p.x, p.y]));
    switch (e.type) {
      case 'LINE': {
        const [a, b] = [t(e.vertices[0]), t(e.vertices[1])];
        add(['L', layer, round(a[0]), round(a[1]), round(b[0]), round(b[1])]);
        count(read, 'LINE');
        break;
      }
      case 'ARC': {
        if ((e.extrusionDirectionZ ?? 1) < 0) {
          // Speilet bue (normal 0,0,-1): OCS-x er motsatt. Speil sentrum og snu vinklene.
          e = {
            ...e,
            center: { ...e.center, x: -e.center.x },
            startAngle: Math.PI - e.endAngle,
            endAngle: Math.PI - e.startAngle,
          };
        }
        if (isSimilarity(m)) {
          const c = t(e.center);
          const s = Math.hypot(m.a, m.b);
          const rot = Math.atan2(m.b, m.a);
          add([
            'A',
            layer,
            round(c[0]),
            round(c[1]),
            round(e.radius * s),
            round(deg(e.startAngle + rot)),
            round(deg(e.endAngle + rot)),
          ]);
        } else {
          pushPoly(
            layer,
            arcPoints([e.center.x, e.center.y], e.radius, e.startAngle, e.endAngle).map((p) =>
              apply(m, p),
            ),
            false,
          );
        }
        count(read, 'ARC');
        break;
      }
      case 'CIRCLE': {
        if ((e.extrusionDirectionZ ?? 1) < 0) e = { ...e, center: { ...e.center, x: -e.center.x } };
        if (isSimilarity(m)) {
          const c = t(e.center);
          add(['C', layer, round(c[0]), round(c[1]), round(e.radius * Math.hypot(m.a, m.b))]);
        } else {
          pushPoly(
            layer,
            arcPoints([e.center.x, e.center.y], e.radius, 0, 2 * Math.PI).map((p) => apply(m, p)),
            true,
          );
        }
        count(read, 'CIRCLE');
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        let verts = (e.vertices ?? []) as Array<{ x: number; y: number; bulge?: number }>;
        if ((e.extrusionDirectionZ ?? 1) < 0) {
          // Normal (0,0,−1): speil om y-aksen. Speiling snur også buenes retning (bulge-fortegn).
          verts = verts.map((v) => ({ ...v, x: -v.x, bulge: -(v.bulge ?? 0) }));
        }
        // Speiling snur bulge-fortegnet.
        const flip = det(m) < 0 ? -1 : 1;
        pushPoly(
          layer,
          verts.map((v) => [...t(v), (v.bulge ?? 0) * flip] as [number, number, number]),
          !!e.shape,
        );
        count(read, e.type);
        break;
      }
      case 'SPLINE': {
        const pts = ((e.fitPoints?.length ? e.fitPoints : e.controlPoints) ?? []) as Array<{
          x: number;
          y: number;
        }>;
        pushPoly(layer, pts.map(t), !!e.closed);
        simplified++;
        count(read, 'SPLINE');
        break;
      }
      case 'ELLIPSE': {
        const c = e.center as { x: number; y: number };
        const maj = e.majorAxisEndPoint as { x: number; y: number };
        const a = Math.hypot(maj.x, maj.y);
        const b = a * (e.axisRatio ?? 1);
        const rot = Math.atan2(maj.y, maj.x);
        const t0 = e.startAngle ?? 0;
        let t1 = e.endAngle ?? 2 * Math.PI;
        while (t1 <= t0) t1 += 2 * Math.PI;
        const n = 72;
        const pts: P2[] = Array.from({ length: n + 1 }, (_, i) => {
          const u = t0 + ((t1 - t0) * i) / n;
          const x = a * Math.cos(u);
          const y = b * Math.sin(u);
          return t({
            x: c.x + x * Math.cos(rot) - y * Math.sin(rot),
            y: c.y + x * Math.sin(rot) + y * Math.cos(rot),
          });
        });
        pushPoly(layer, pts, false);
        simplified++;
        count(read, 'ELLIPSE');
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const p = t(e.type === 'TEXT' ? e.startPoint : e.position);
        const h = (e.type === 'TEXT' ? e.textHeight : e.height) ?? 1;
        const value = e.type === 'TEXT' ? String(e.text ?? '') : cleanMText(String(e.text ?? ''));
        if (!value) break;
        const rot = (e.rotation ?? 0) + (isIdent(m) ? 0 : (Math.atan2(m.b, m.a) * 180) / Math.PI);
        add([
          'T',
          layer,
          round(p[0]),
          round(p[1]),
          round(h * (isIdent(m) ? 1 : Math.hypot(m.a, m.b))),
          round(rot),
          value,
        ]);
        count(read, e.type);
        break;
      }
      case 'INSERT': {
        const block = blocks[e.name];
        if (!block || depth >= 4) {
          count(skipped, `INSERT (${block ? 'for dyp nesting' : 'ukjent blokk'})`);
          break;
        }
        const sx = e.xScale ?? 1;
        const sy = e.yScale ?? 1;
        const rot = ((e.rotation ?? 0) * Math.PI) / 180;
        const base = block.position ?? { x: 0, y: 0 };
        const local: Xf = {
          a: sx * Math.cos(rot),
          b: sx * Math.sin(rot),
          c: -sy * Math.sin(rot),
          d: sy * Math.cos(rot),
          e: e.position.x - (sx * Math.cos(rot) * base.x - sy * Math.sin(rot) * base.y),
          f: e.position.y - (sx * Math.sin(rot) * base.x + sy * Math.cos(rot) * base.y),
        };
        const rows = Math.max(1, e.rowCount ?? 1);
        const cols = Math.max(1, e.columnCount ?? 1);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (++work > MAX_WORK) throw new LimitError('work');
            // Matrisemellomrom måles i INSERT-ens rotasjonsramme, uten skalering (AutoCAD-regelen).
            const dx = c * (e.columnSpacing ?? 0);
            const dy = r * (e.rowSpacing ?? 0);
            const cell: Xf = {
              ...local,
              e: local.e + Math.cos(rot) * dx - Math.sin(rot) * dy,
              f: local.f + Math.sin(rot) * dx + Math.cos(rot) * dy,
            };
            const off = compose(m, cell);
            for (const be of block.entities ?? []) handle(be, off, depth + 1, layerName);
          }
        }
        count(read, 'INSERT');
        break;
      }
      default:
        count(skipped, String(e.type));
    }
  };

  /** Én ødelagt entitet (f.eks. LINE uten sluttpunkt) hoppes over og rapporteres – importen fortsetter. */
  const handle = (e: Ent, m: Xf, depth: number, inherit?: string) => {
    try {
      handleRaw(e, m, depth, inherit);
    } catch (err) {
      if (err instanceof LimitError) throw err;
      count(skipped, `${String(e?.type ?? 'ukjent')} (ugyldig)`);
    }
  };

  try {
    for (const e of doc.entities as Ent[]) handle(e, IDENT, 0);
  } catch (err) {
    if (err instanceof LimitError) {
      return {
        ok: false,
        error: `Filen er for kompleks (over ${BACKGROUND_LIMITS.maxPrims} elementer etter utvidelse av blokker).`,
      };
    }
    throw err;
  }
  if (prims.length === 0)
    return { ok: false, error: 'Fant ingen støttede tegneelementer i filen.' };
  if (prims.length > BACKGROUND_LIMITS.maxPrims) {
    return {
      ok: false,
      error: `Filen har for mange elementer (${prims.length}; maks ${BACKGROUND_LIMITS.maxPrims}).`,
    };
  }

  // Utstrekning (inkl. buer/sirkler grovt via sentrum ± radius) og normalisering til origo.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const p of prims) {
    if (p[0] === 'L') {
      grow(p[2], p[3]);
      grow(p[4], p[5]);
    } else if (p[0] === 'A' || p[0] === 'C') {
      grow(p[2] - p[4], p[3] - p[4]);
      grow(p[2] + p[4], p[3] + p[4]);
    } else if (p[0] === 'P') {
      for (let i = 0; i < p[3].length; i += 3) grow(p[3][i] as number, p[3][i + 1] as number);
    } else grow(p[2], p[3]);
  }
  const offset: [number, number] = [minX, minY];
  const norm: DxfPrim[] = prims.map((p) => {
    switch (p[0]) {
      case 'L':
        return [
          'L',
          p[1],
          round(p[2] - minX),
          round(p[3] - minY),
          round(p[4] - minX),
          round(p[5] - minY),
        ];
      case 'A':
        return ['A', p[1], round(p[2] - minX), round(p[3] - minY), p[4], p[5], p[6]];
      case 'C':
        return ['C', p[1], round(p[2] - minX), round(p[3] - minY), p[4]];
      case 'P':
        return [
          'P',
          p[1],
          p[2],
          p[3].map((v, i) => (i % 3 === 0 ? round(v - minX) : i % 3 === 1 ? round(v - minY) : v)),
        ];
      default:
        return ['T', p[1], round(p[2] - minX), round(p[3] - minY), p[4], p[5], p[6]];
    }
  });

  const insunitsRaw = (doc.header as Record<string, unknown>)?.$INSUNITS;
  const insunits = typeof insunitsRaw === 'number' ? insunitsRaw : undefined;
  return {
    ok: true,
    result: {
      layers: layerNames.map((name, i) => ({ name, color: layerColors[i] ?? 7 })),
      prims: norm,
      extents: { minX: 0, minY: 0, maxX: round(maxX - minX), maxY: round(maxY - minY) },
      offset,
      insunits,
      unitName:
        insunits !== undefined ? (DXF_UNIT_NAMES[insunits] ?? `ukjent (${insunits})`) : 'unitless',
      metersPerUnit: metersPerDxfUnit(insunits),
      summary: { read, skipped, simplified },
    },
  };
}
