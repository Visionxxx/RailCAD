import demo from '@fixtures/demo-verksted.json';
import demoLodalen from '@fixtures/demo-lodalen.json';
import { exportDxf, type DxfVersion } from '@railcad/dxf';
import { geometryEngine } from './engine';
import { importBackgroundFile, pickBackgroundFile } from './io/background';
import { useViewStore } from './stores/view';
import { backgroundWorldBounds } from './rendering/background';
import {
  downloadProject,
  downloadText,
  dxfFileNameFor,
  pickProjectFile,
  readProjectFile,
  type OpenResult,
} from './io/files';
import { loadProject } from '@railcad/domain';
import { useProjectStore } from './stores/project';
import { useUiStore } from './stores/ui';

/** Filhandlinger delt mellom meny og hurtigtaster. */
export function useActions() {
  const project = useProjectStore();
  const ui = useUiStore();
  const viewStore = useViewStore();

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

  /** Eksporterer sporakser, sporveksler og mål til DXF (lag: sporakse, sporveksel, mål, tekst). */
  function exportDxfFile(version: DxfVersion) {
    const p = project.toProject();
    const text = exportDxf(p, geometryEngine, version);
    const name = dxfFileNameFor(p.project.name, version);
    downloadText(name, text, 'application/dxf');
    ui.notify(`Eksporterte ${name} (DXF ${version}, meter).`);
  }

  /** Importerer DXF, PDF eller bilde som referansebakgrunn (valgfri plassering/skala settes etterpå). */
  async function importBackground() {
    const file = await pickBackgroundFile();
    if (!file) return;
    importBackgroundFrom(file);
  }
  async function importBackgroundFrom(file: File) {
    ui.notify(`Leser ${file.name} …`);
    const result = await importBackgroundFile(file, {
      existingIds: project.backgrounds.map((b) => b.id),
      viewCenter: [viewStore.view.cx, viewStore.view.cy],
    });
    if (!result.ok) {
      ui.showDialog({ title: 'Kunne ikke importere bakgrunn', lines: [result.error] });
      return;
    }
    const bg = result.background;
    project.addBackground(bg);
    viewStore.activeBackgroundId = bg.id;
    ui.showTab('backgrounds');
    viewStore.fitToBounds(backgroundWorldBounds(bg));
    if (result.notes.length) {
      ui.showDialog({ title: `Bakgrunn importert: ${bg.name}`, lines: result.notes });
    } else {
      ui.notify(`Importerte bakgrunn «${bg.name}».`);
    }
  }

  return {
    importBackground,
    importBackgroundFrom,
    newProject,
    openFile,
    openDemo,
    openLodalenDemo,
    save,
    exportDxfFile,
  };
}
