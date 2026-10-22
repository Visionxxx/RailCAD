import { CURRENT_SCHEMA_VERSION, validateProject, type ProjectValidation } from './validation';

/**
 * Migreringstabell: nøkkel = eldre schemaVersion, verdi = funksjon som løfter
 * rådata til neste versjon. Tom i dag (0.1.0 er første format).
 */
const migrations: Record<string, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

/** Leser rådata, migrerer om nødvendig og validerer. Ukjente (nyere) versjoner avvises. */
export function loadProject(raw: unknown): ProjectValidation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['Filen inneholder ikke et prosjektobjekt.'] };
  }
  let data = raw as Record<string, unknown>;
  let guard = 0;
  while (typeof data.schemaVersion === 'string' && data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    const step = migrations[data.schemaVersion];
    if (!step || guard++ > 20) {
      return {
        ok: false,
        errors: [
          `schemaVersion «${data.schemaVersion}» støttes ikke (gjeldende: ${CURRENT_SCHEMA_VERSION}).`,
        ],
      };
    }
    data = step(data);
  }
  return validateProject(data);
}
