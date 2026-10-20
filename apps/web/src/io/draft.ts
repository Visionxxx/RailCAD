import { loadProject, serializeProject, type RailProject } from '@railcad/domain';

/**
 * Automatisk sikkerhetskopi i nettleserens lokale lagring, slik at ulagret arbeid overlever en
 * oppdatering eller krasj. Dette er IKKE lagring av prosjektet – bare en «kladd» som tilbys
 * gjenopprettet ved neste oppstart. Brukes kun lokalt; ingenting sendes noe sted.
 */
const KEY = 'railcad.draft';
/** Lokal lagring tåler typisk ~5 MB; hold margin. Større prosjekter får ingen sikkerhetskopi. */
export const MAX_DRAFT_CHARS = 4_000_000;

export interface Draft {
  savedAt: string;
  name: string;
  project: RailProject;
}

export function encodeDraft(project: RailProject, now = new Date()): string | null {
  const text = JSON.stringify({
    savedAt: now.toISOString(),
    name: project.project.name,
    data: serializeProject(project),
  });
  return text.length <= MAX_DRAFT_CHARS ? text : null;
}

/** Leser og validerer en kladd. Ugyldig eller ødelagt innhold gir null – aldri et halvt prosjekt. */
export function decodeDraft(text: string | null): Draft | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as { savedAt?: unknown; name?: unknown; data?: unknown };
    if (typeof raw.data !== 'string' || typeof raw.savedAt !== 'string') return null;
    const result = loadProject(JSON.parse(raw.data));
    if (!result.ok) return null;
    return { savedAt: raw.savedAt, name: String(raw.name ?? ''), project: result.project };
  } catch {
    return null;
  }
}

export type DraftWrite = 'ok' | 'too-large' | 'blocked';

export function writeDraft(project: RailProject): DraftWrite {
  const text = encodeDraft(project);
  if (text === null) return 'too-large';
  try {
    localStorage.setItem(KEY, text);
    return 'ok';
  } catch {
    return 'blocked'; // kvote full eller lagring blokkert
  }
}

export function readDraft(): Draft | null {
  try {
    return decodeDraft(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ingenting å rydde hvis lagring er blokkert */
  }
}
