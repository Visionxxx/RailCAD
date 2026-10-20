import { loadProject, serializeProject, type RailProject } from '@railcad/domain';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export type OpenResult = { ok: true; project: RailProject } | { ok: false; errors: string[] };

/** Parser og validerer prosjekttekst. Kaster aldri – feil returneres som liste. */
export function parseProjectText(text: string): OpenResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Filen er ikke gyldig JSON (${(e as Error).message}).`] };
  }
  return loadProject(raw);
}

export async function readProjectFile(file: File): Promise<OpenResult> {
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      errors: [`Filen er for stor (${Math.round(file.size / 1e6)} MB, maks 50 MB).`],
    };
  }
  return parseProjectText(await file.text());
}

export function dxfFileNameFor(name: string, version: string): string {
  return fileNameFor(name).replace(/\.railcad\.json$/, `-${version.toLowerCase()}.dxf`);
}

export function fileNameFor(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${slug || 'prosjekt'}.railcad.json`;
}

/** Laster ned tekst som lokal fil (ingen server involvert). */
export function downloadText(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Laster ned prosjektet som lokal JSON-fil. */
export function downloadProject(project: RailProject): string {
  const name = fileNameFor(project.project.name);
  downloadText(name, serializeProject(project), 'application/json');
  return name;
}

export function pickProjectFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
