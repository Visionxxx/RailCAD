import { DxfWriter, Units, point3d } from '@tarikjabiri/dxf';
import { LAYERS, type DxfEntity } from './entities';

export type DxfVersion = 'R12' | 'R2007';

const numberText = (n: number) => String(+n.toFixed(9));

/** R12 er ASCII; norske tegn transkriberes. */
export function asciiText(s: string): string {
  const map: Record<string, string> = {
    æ: 'ae',
    ø: 'o',
    å: 'aa',
    Æ: 'AE',
    Ø: 'O',
    Å: 'AA',
    '°': ' deg',
    '–': '-',
    '↔': '<->',
  };
  return s.replace(/[^\x20-\x7e]/g, (c) => map[c] ?? '?');
}

/** DXF R12 (AC1009), ASCII. Håndskrevet – formatet er enkelt og tolerant. */
export function writeR12(entities: readonly DxfEntity[], comment: string): string {
  const out: string[] = [];
  const pair = (code: number, value: string | number) => out.push(String(code), String(value));
  pair(999, asciiText(comment));
  pair(0, 'SECTION');
  pair(2, 'HEADER');
  pair(9, '$ACADVER');
  pair(1, 'AC1009');
  pair(0, 'ENDSEC');

  pair(0, 'SECTION');
  pair(2, 'TABLES');
  pair(0, 'TABLE');
  pair(2, 'LTYPE');
  pair(70, 1);
  pair(0, 'LTYPE');
  pair(2, 'CONTINUOUS');
  pair(70, 0);
  pair(3, 'Solid line');
  pair(72, 65);
  pair(73, 0);
  pair(40, 0);
  pair(0, 'ENDTAB');
  const layers = Object.values(LAYERS);
  pair(0, 'TABLE');
  pair(2, 'LAYER');
  pair(70, layers.length);
  for (const l of layers) {
    pair(0, 'LAYER');
    pair(2, l.name);
    pair(70, 0);
    pair(62, l.color);
    pair(6, 'CONTINUOUS');
  }
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');

  pair(0, 'SECTION');
  pair(2, 'ENTITIES');
  for (const e of entities) {
    if (e.kind === 'line') {
      pair(0, 'LINE');
      pair(8, e.layer);
      pair(10, numberText(e.a[0]));
      pair(20, numberText(e.a[1]));
      pair(30, 0);
      pair(11, numberText(e.b[0]));
      pair(21, numberText(e.b[1]));
      pair(31, 0);
    } else if (e.kind === 'arc') {
      pair(0, 'ARC');
      pair(8, e.layer);
      pair(10, numberText(e.center[0]));
      pair(20, numberText(e.center[1]));
      pair(30, 0);
      pair(40, numberText(e.radius));
      pair(50, numberText(e.startDeg));
      pair(51, numberText(e.endDeg));
    } else {
      pair(0, 'TEXT');
      pair(8, e.layer);
      pair(10, numberText(e.at[0]));
      pair(20, numberText(e.at[1]));
      pair(30, 0);
      pair(40, numberText(e.height));
      pair(1, asciiText(e.value));
      pair(50, numberText(e.rotationDeg));
    }
  }
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

/**
 * DXF R2007 (AC1021) via @tarikjabiri/dxf (komplett tabell-/blokkstruktur). UTF-8, så norske tegn
 * skrives direkte. Enhet: meter.
 */
export function writeR2007(entities: readonly DxfEntity[]): string {
  const w = new DxfWriter();
  w.setUnits(Units.Meters);
  for (const l of Object.values(LAYERS)) w.addLayer(l.name, l.color, 'CONTINUOUS');
  for (const e of entities) {
    if (e.kind === 'line') {
      w.addLine(point3d(e.a[0], e.a[1]), point3d(e.b[0], e.b[1]), { layerName: e.layer });
    } else if (e.kind === 'arc') {
      w.addArc(point3d(e.center[0], e.center[1]), e.radius, e.startDeg, e.endDeg, {
        layerName: e.layer,
      });
    } else {
      w.addText(point3d(e.at[0], e.at[1]), e.height, e.value, {
        layerName: e.layer,
        rotation: e.rotationDeg,
      });
    }
  }
  return w.stringify();
}
