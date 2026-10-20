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
    return { ok: false, errors: [`Filen er for stor (${Math.round(file.size / 1e6)} MB, maks 50 MB).`] };
  }
  return parseProjectText(await file.text());
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

/** Laster ned prosjektet som lokal JSON-fil. Ingen server involvert. */
export function downloadProject(project: RailProject): string {
  const name = fileNameFor(project.project.name);
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
