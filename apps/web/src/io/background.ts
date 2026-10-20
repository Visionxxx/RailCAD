import {
  BACKGROUND_LIMITS,
  nextId,
  type Background,
  type BackgroundPlacement,
  type Vec2,
} from '@railcad/domain';
import { readDxfBackground } from '@railcad/dxf';

export type BackgroundImport =
  { ok: true; background: Background; notes: string[] } | { ok: false; error: string };

export interface ImportContext {
  existingIds: Iterable<string>;
  /** Verdenskoordinaten midt i tegneflaten – brukes til å plassere innhold uten kjent posisjon. */
  viewCenter: Vec2;
}

const MAX_BACKGROUND_FILE_BYTES = 40 * 1024 * 1024;
const PDF_MAX_SIDE_PX = 4000;
/** Over denne koordinatstørrelsen beholdes ikke DXF-ens opprinnelige posisjon (typisk UTM). */
const KEEP_POSITION_BELOW = 1e5;
/** Antatt bredde (m) for bilder uten kjent skala – bare en startverdi til brukeren har skalert. */
const ASSUMED_IMAGE_WIDTH_M = 200;

const baseName = (file: File) => file.name.replace(/\.[^.]+$/, '') || file.name;

/** Leser DXF-tekst med riktig tegnsett: R2007+ er UTF-8, eldre versjoner bruker ANSI (Windows-1252). */
function decodeDxf(buffer: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(buffer.slice(0, 8192));
  const version = /\$ACADVER\s+1\s+(AC\d+)/.exec(head)?.[1];
  const modern = version !== undefined && version >= 'AC1021';
  return new TextDecoder(modern ? 'utf-8' : 'windows-1252').decode(buffer);
}

function defaultPlacementForImage(
  widthPx: number,
  heightPx: number,
  ctx: ImportContext,
): BackgroundPlacement {
  const scale = ASSUMED_IMAGE_WIDTH_M / widthPx;
  return {
    origin: [ctx.viewCenter[0] - (widthPx * scale) / 2, ctx.viewCenter[1] - (heightPx * scale) / 2],
    scaleMPerUnit: scale,
    rotationRad: 0,
    scaleConfirmed: false,
  };
}

async function importDxf(file: File, ctx: ImportContext): Promise<BackgroundImport> {
  const parsed = readDxfBackground(decodeDxf(await file.arrayBuffer()));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const r = parsed.result;
  const notes: string[] = [];
  const scale = r.metersPerUnit ?? 1;
  const confirmed = r.metersPerUnit !== null;
  if (!confirmed)
    notes.push(
      'Filen mangler enhet (enhetsløs). Skalaen er antatt 1 enhet = 1 m – kontroller og skaler ved behov.',
    );
  else if (scale !== 1) notes.push(`Enhet: ${r.unitName} (1 enhet = ${scale} m).`);

  const keep = Math.max(Math.abs(r.offset[0]), Math.abs(r.offset[1])) * scale < KEEP_POSITION_BELOW;
  const width = r.extents.maxX * scale;
  const height = r.extents.maxY * scale;
  const origin: Vec2 = keep
    ? [r.offset[0] * scale, r.offset[1] * scale]
    : [ctx.viewCenter[0] - width / 2, ctx.viewCenter[1] - height / 2];
  if (!keep) {
    notes.push(
      `Store koordinater (${Math.round(r.offset[0])}, ${Math.round(r.offset[1])}). Bakgrunnen er plassert midt i visningen – flytt den med «Flytt» eller tallfeltene.`,
    );
  }
  const skipped = Object.entries(r.summary.skipped);
  if (skipped.length)
    notes.push(`Hoppet over: ${skipped.map(([k, n]) => `${n} × ${k}`).join(', ')}.`);
  if (r.summary.simplified)
    notes.push(`${r.summary.simplified} kurver (SPLINE/ELLIPSE) er forenklet til linjer.`);

  return {
    ok: true,
    notes,
    background: {
      kind: 'dxf',
      id: nextId('bg', ctx.existingIds),
      name: baseName(file),
      visible: true,
      opacity: 1,
      placement: { origin, scaleMPerUnit: scale, rotationRad: 0, scaleConfirmed: confirmed },
      layers: r.layers,
      prims: r.prims,
      sourceUnits: r.unitName,
      extents: r.extents,
    },
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Kunne ikke lese bildet.'));
    img.src = url;
  });
}

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Kunne ikke lese filen.'));
    fr.readAsDataURL(file);
  });

async function importImage(file: File, ctx: ImportContext): Promise<BackgroundImport> {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    return { ok: false, error: 'Bildeformatet støttes ikke. Bruk PNG, JPEG, PDF eller DXF.' };
  }
  const notes: string[] = [];
  let dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const side = BACKGROUND_LIMITS.maxImagePixelsPerSide;
  if (w > side || h > side) {
    const k = side / Math.max(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k);
    canvas.height = Math.round(h * k);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92);
    w = canvas.width;
    h = canvas.height;
    notes.push(`Bildet er nedskalert til ${w} × ${h} piksler.`);
  }
  if (dataUrl.length > BACKGROUND_LIMITS.maxImageDataUrlChars) {
    return {
      ok: false,
      error: 'Bildet er for stort til å bli lagret i prosjektfilen (maks ca. 10 MB).',
    };
  }
  notes.push('Skalaen er ukjent. Bruk «Skaler med to punkter» og oppgi en kjent avstand.');
  return {
    ok: true,
    notes,
    background: {
      kind: 'image',
      source: 'image',
      id: nextId('bg', ctx.existingIds),
      name: baseName(file),
      visible: true,
      opacity: 0.6,
      placement: defaultPlacementForImage(w, h, ctx),
      dataUrl,
      widthPx: w,
      heightPx: h,
    },
  };
}

async function importPdf(file: File, ctx: ImportContext): Promise<BackgroundImport> {
  // pdf.js er stort – last det først når en PDF faktisk importeres.
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (e) {
    return { ok: false, error: `Kunne ikke lese PDF: ${(e as Error).message}` };
  }
  const notes: string[] = [];
  if (doc.numPages > 1) notes.push(`PDF-en har ${doc.numPages} sider. Bare side 1 er importert.`);
  const page = await doc.getPage(1);
  const natural = page.getViewport({ scale: 1 });
  const k = Math.min(4, PDF_MAX_SIDE_PX / Math.max(natural.width, natural.height));
  const viewport = page.getViewport({ scale: k });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: g, canvas, viewport }).promise;
  let dataUrl = canvas.toDataURL('image/png');
  if (dataUrl.length > BACKGROUND_LIMITS.maxImageDataUrlChars) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    notes.push('Siden er lagret som JPEG for å holde prosjektfilen liten.');
  }
  if (dataUrl.length > BACKGROUND_LIMITS.maxImageDataUrlChars) {
    return { ok: false, error: 'PDF-siden blir for stor å lagre i prosjektfilen.' };
  }
  notes.push('Skalaen er ukjent. Bruk «Skaler med to punkter» og oppgi en kjent avstand.');
  return {
    ok: true,
    notes,
    background: {
      kind: 'image',
      source: 'pdf',
      id: nextId('bg', ctx.existingIds),
      name: baseName(file),
      visible: true,
      opacity: 0.6,
      placement: defaultPlacementForImage(canvas.width, canvas.height, ctx),
      dataUrl,
      widthPx: canvas.width,
      heightPx: canvas.height,
    },
  };
}

/** Importerer DXF, PNG/JPEG eller PDF som referansebakgrunn. Kaster ikke – feil returneres. */
export async function importBackgroundFile(
  file: File,
  ctx: ImportContext,
): Promise<BackgroundImport> {
  if (file.size > MAX_BACKGROUND_FILE_BYTES) {
    return {
      ok: false,
      error: `Filen er for stor (${Math.round(file.size / 1e6)} MB, maks 40 MB).`,
    };
  }
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.dxf')) return await importDxf(file, ctx);
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return await importPdf(file, ctx);
    if (file.type.startsWith('image/')) return await importImage(file, ctx);
    return { ok: false, error: 'Filtypen støttes ikke. Bruk DXF, PDF, PNG eller JPEG.' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function pickBackgroundFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dxf,.pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
