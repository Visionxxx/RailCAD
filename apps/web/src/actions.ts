import demo from '@fixtures/demo-verksted.json';
import demoLodalen from '@fixtures/demo-lodalen.json';
import { downloadProject, pickProjectFile, readProjectFile, type OpenResult } from './io/files';
import { loadProject } from '@railcad/domain';
import { useProjectStore } from './stores/project';
import { useUiStore } from './stores/ui';

/** Filhandlinger delt mellom meny og hurtigtaster. */
export function useActions() {
  const project = useProjectStore();
  const ui = useUiStore();

  /** Utfører `action` – etter bekreftelse hvis det finnes ulagrede endringer. */
  function guardDirty(action: () => void) {
    if (!project.dirty) return action();
    ui.showDialog({
      title: 'Ulagrede endringer',
      lines: ['Prosjektet har ulagrede endringer som går tapt hvis du fortsetter.'],
      confirmLabel: 'Forkast og fortsett',
      onConfirm: action,
    });
  }

  function showOpenErrors(result: Extract<OpenResult, { ok: false }>) {
    const shown = result.errors.slice(0, 12);
    if (result.errors.length > shown.length)
      shown.push(`… og ${result.errors.length - shown.length} til`);
    ui.showDialog({ title: 'Kunne ikke åpne prosjektet', lines: shown });
  }

  function newProject() {
    guardDirty(() => {
      project.reset();
      ui.notify('Nytt prosjekt opprettet.');
    });
  }

  function openFile() {
    guardDirty(async () => {
      const file = await pickProjectFile();
      if (!file) return;
      const result = await readProjectFile(file);
      if (!result.ok) return showOpenErrors(result);
      project.load(result.project);
      ui.notify(`Åpnet «${result.project.project.name}».`);
    });
  }

  function openDemo() {
    openFixture(demo);
  }
  function openLodalenDemo() {
    openFixture(demoLodalen);
  }
  function openFixture(data: unknown) {
    guardDirty(() => {
      const result = loadProject(data);
      if (!result.ok) return showOpenErrors(result);
      project.load(result.project);
    });
  }

  function save() {
    const name = downloadProject(project.toProject());
    project.markSaved();
    ui.notify(`Lagret som ${name}.`);
  }

  return { newProject, openFile, openDemo, openLodalenDemo, save };
}
