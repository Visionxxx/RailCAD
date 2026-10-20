import { computed, ref, shallowRef } from 'vue';
import type { Vec2 } from '@railcad/domain';
import { geometryEngine } from '../engine';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import { useViewStore } from '../stores/view';
import { ArcTool, LineTool } from './drawing';
import { DeleteTool, MeasureDistanceTool, MeasureLengthTool, PanTool, ParallelTool, RotateTool } from './operations';
import { SelectTool } from './select';
import type { KeyInfo, Tool, ToolEnv } from './tool';
import type { PointerInfo, Preview, ToolId } from './types';

export const TOOL_SHORTCUTS: Record<ToolId, string> = {
  select: 'V', pan: 'H', line: 'L', arc: 'C', parallel: 'P',
  'measure-length': 'M', 'measure-distance': 'D', rotate: 'R', delete: 'E',
};

/** Samler verktøyene, holder aktivt verktøy og forhåndsvisning, og fordeler pekerhendelser. */
export function createToolController() {
  const project = useProjectStore();
  const view = useViewStore();
  const ui = useUiStore();

  const preview = shallowRef<Preview | null>(null);
  const activeId = ref<ToolId>('select');
  // Økes ved fase-skifte i et verktøy slik at veiledningen oppdateres.
  const tick = ref(0);

  const env: ToolEnv = {
    project, view, ui, engine: geometryEngine,
    setPreview: (p) => {
      preview.value = p;
      tick.value++;
    },
    setTool: (id) => setTool(id),
  };

  const tools: Record<ToolId, Tool> = {
    select: new SelectTool(env),
    pan: new PanTool(env),
    line: new LineTool(env),
    arc: new ArcTool(env),
    parallel: new ParallelTool(env),
    'measure-length': new MeasureLengthTool(env),
    'measure-distance': new MeasureDistanceTool(env),
    rotate: new RotateTool(env),
    delete: new DeleteTool(env),
  };

  const active = computed(() => tools[activeId.value]);
  const hint = computed(() => {
    void tick.value;
    return active.value.hint();
  });

  function setTool(id: ToolId) {
    if (id === activeId.value) return;
    tools[activeId.value].deactivate();
    preview.value = null;
    activeId.value = id;
    tools[id].activate();
    tick.value++;
  }

  /** Beregner snap for gjeldende verktøy og tilstand. */
  function snapAt(world: Vec2) {
    const t = active.value;
    const dragging = t instanceof SelectTool ? t.dragging : true;
    if (!t.snapEnabled || !dragging) return null;
    return geometryEngine.snap(project.trackRefs, {
      cursor: world,
      toleranceM: view.snapToleranceM,
      kinds: view.activeSnapKinds,
      reference: t.snapReference,
      gridStepM: view.grid.minor,
      excludeIds: t.snapExclude,
    });
  }

  function dispatch(kind: 'down' | 'move' | 'up', p: PointerInfo) {
    tools[activeId.value][kind](p);
    tick.value++;
  }

  function key(k: KeyInfo): boolean {
    const handled = active.value.key(k);
    tick.value++;
    return handled;
  }

  /** Esc: avbryt pågående kommando, ellers tilbake til Marker. */
  function escape() {
    const t = active.value;
    if (t.key({ key: 'Escape', shift: false, ctrl: false })) {
      tick.value++;
      return;
    }
    if (t.cancel()) {
      tick.value++;
      return;
    }
    if (activeId.value !== 'select') setTool('select');
  }

  return { tools, activeId, active, hint, preview, setTool, snapAt, dispatch, key, escape, env };
}

export type ToolController = ReturnType<typeof createToolController>;

let instance: ToolController | null = null;
export function useTools(): ToolController {
  return (instance ??= createToolController());
}
