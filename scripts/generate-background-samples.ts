/**
 * Genererer syntetiske bakgrunnsfiler i fixtures/background/ (ikke reelt kartgrunnlag):
 *  - kartunderlag.png  – 1600 × 800 px. Skalalinje nederst: 1000 px = 100 m (1 px = 0,1 m).
 *  - kartunderlag.pdf  – én A3-side (1190 × 842 pt). Skalalinje: 400 pt = 100 m.
 *
 *   npx tsx scripts/generate-background-samples.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const OUT = 'fixtures/background';
mkdirSync(OUT, { recursive: true });

// ---------- PNG ----------
const W = 1600;
const H = 800;
const px = new Uint8Array(W * H * 3);
const setPx = (x: number, y: number, c: [number, number, number]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  px.set(c, (y * W + x) * 3);
};
const fill = (c: [number, number, number]) => { for (let i = 0; i < W * H; i++) px.set(c, i * 3); };
const rect = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setPx(x, y, c);
};
const line = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number], t = 1) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    rect(x - (t >> 1), y - (t >> 1), x + (t >> 1), y + (t >> 1), c);
  }
};
fill([236, 228, 208]);
rect(250, 380, 700, 470, [205, 192, 172]); // hall
rect(780, 400, 1100, 480, [205, 192, 172]);
rect(120, 120, 220, 190, [205, 192, 172]);
line(0, 90, 1600, 120, [255, 255, 255], 14); // vei
line(0, 700, 1600, 690, [255, 255, 255], 12);
for (let k = 0; k < 6; k++) line(60, 250 + k * 18, 1540, 235 + k * 30, [90, 90, 90], 2); // spor
line(200, 760, 1200, 760, [20, 20, 20], 3); // skalalinje 1000 px = 100 m
line(200, 750, 200, 770, [20, 20, 20], 3);
line(1200, 750, 1200, 770, [20, 20, 20], 3);

const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8 bit RGB
writeFileSync(
  `${OUT}/kartunderlag.png`,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]),
);

// ---------- PDF (håndskrevet, én side) ----------
const content = [
  '0.93 0.89 0.82 rg 0 0 1190 842 re f',
  '0.80 0.75 0.68 rg 300 300 320 60 re f 700 320 220 55 re f 100 650 80 50 re f',
  '1 1 1 RG 14 w 0 760 m 1190 740 l S',
  '0.35 0.35 0.35 RG 1.5 w',
  ...Array.from({ length: 6 }, (_, k) => `60 ${420 + k * 14} m 1130 ${400 + k * 28} l S`),
  '0 0 0 RG 2 w 100 60 m 500 60 l S 100 52 m 100 68 l S 500 52 m 500 68 l S',
  'BT /F1 14 Tf 100 78 Td (Skalalinje 100 m \\(syntetisk testdata\\)) Tj ET',
].join('\n');
const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1190 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n';
const offsets: number[] = [];
objs.forEach((o, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(`${OUT}/kartunderlag.pdf`, pdf, 'latin1');

// ---------- PDF med to sider (tester sidevalg ved import) ----------
const page2 = [
  '0.85 0.92 0.85 rg 0 0 1190 842 re f',
  '0 0 0 RG 3 w 100 400 m 1100 400 l S 100 420 m 1100 420 l S',
  'BT /F1 24 Tf 100 500 Td (Side 2 \\(syntetisk testdata\\)) Tj ET',
].join('\n');
const objs2 = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1190 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1190 842] /Contents 7 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(page2)} >>\nstream\n${page2}\nendstream`,
];
let pdf2 = '%PDF-1.4\n';
const offsets2: number[] = [];
objs2.forEach((o, i) => {
  offsets2.push(Buffer.byteLength(pdf2));
  pdf2 += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref2 = Buffer.byteLength(pdf2);
pdf2 += `xref\n0 ${objs2.length + 1}\n0000000000 65535 f \n`;
for (const off of offsets2) pdf2 += `${String(off).padStart(10, '0')} 00000 n \n`;
pdf2 += `trailer\n<< /Size ${objs2.length + 1} /Root 1 0 R >>\nstartxref\n${xref2}\n%%EOF\n`;
writeFileSync(`${OUT}/kartunderlag-2sider.pdf`, pdf2, 'latin1');
console.log(`Skrev ${OUT}/kartunderlag.png, kartunderlag.pdf og kartunderlag-2sider.pdf`);
