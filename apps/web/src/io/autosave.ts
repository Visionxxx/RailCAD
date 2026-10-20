import { watch } from 'vue';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import { clearDraft, readDraft, writeDraft } from './draft';

const DEBOUNCE_MS = 1500;

/**
 * Sikkerhetskopi av ulagret arbeid: skriver en kladd kort tid etter hver endring, fjerner den når
 * prosjektet er lagret/nytt/åpnet, og tilbyr gjenoppretting ved oppstart.
 */
export function useAutosave() {
  const project = useProjectStore();
  const ui = useUiStore();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;

  function flush() {
    timer = undefined;
    if (!project.dirty) {
      clearDraft();
      return;
    }
    const result = writeDraft(project.toProject());
    if (result !== 'ok' && !warned) {
      warned = true;
      ui.notify(
        'Prosjektet er for stort for automatisk sikkerhetskopi i nettleseren – husk å lagre ofte.',
        'error',
      );
    }
  }

  function start() {
    watch(
      () => [project.revision, project.dirty],
      () => {
        if (!project.dirty) return flush(); // lagret/nytt/åpnet: fjern kladden med en gang
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, DEBOUNCE_MS);
      },
    );
    // Siste sjanse før fanen lukkes
    window.addEventListener('pagehide', () => project.dirty && flush());
    offerRestore();
  }

  function offerRestore() {
    const draft = readDraft();
    if (!draft) return;
    const when = new Date(draft.savedAt).toLocaleString('nb-NO');
    ui.showDialog({
      title: 'Gjenopprette ulagret arbeid?',
      lines: [
        `Det finnes en automatisk sikkerhetskopi av «${draft.name || 'Uten navn'}» fra ${when}.`,
        'Den ble ikke lagret som fil. Velg «Gjenopprett» for å fortsette der du slapp.',
      ],
      confirmLabel: 'Gjenopprett',
      cancelLabel: 'Forkast',
      onConfirm: () => {
        project.load(draft.project);
        project.touch(); // gjenopprettet arbeid er fortsatt ulagret
        ui.notify('Gjenopprettet ulagret arbeid.');
      },
      onCancel: clearDraft,
    });
  }

  return { start };
}
