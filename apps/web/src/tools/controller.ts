import { computed, ref, shallowRef, watch } from 'vue';
import type { Vec2 } from '@railcad/domain';
import { geometryEngine } from '../engine';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import { useViewStore } from '../stores/view';
import { ArcTool, LineTool } from './drawing';
import {
  DeleteTool,
  MeasureDistanceTool,
  MeasureLengthTool,
  PanTool,
  ParallelTool,
  RotateTool,
} from './operations';
import { BackgroundMoveTool, BackgroundScaleTool } from './background';
import { ConnectTool } from './connect';
import { CrossingTool } from './crossing';
import { SelectTool } from './select';
import { TurnoutTool } from './turnout';
import type { KeyInfo, PortMenuState, Tool, ToolEnv } from './tool';
import type { PointerInfo, Preview, ToolId } from './types';

export const TOOL_SHORTCUTS: Record<ToolId, string> = {
  select: 'V',
  pan: 'H',
  line: 'L',
  arc: 'C',
  parallel: 'P',
  'measure-length': 'M',
  'measure-distance': 'D',
  rotate: 'R',
  connect: 'K',
  turnout: 'T',
  crossing: 'X',
  'bg-scale': '',
  'bg-move': '',
  delete: 'E',
};

/** Samler verktøyene, holder aktivt verktøy og forhåndsvisning, og fordeler pekerhendelser. */
export function createToolController() {
  const project = useProjectStore();
  const view = useViewStore();
  const ui = useUiStore();

  const preview = shallowRef<Preview | null>(null);
  const portMenu = shallowRef<PortMenuState | null>(null);
  const activeId = ref<ToolId>('select');
  // Økes ved fase-skifte i et verktøy slik at veiledningen oppdateres.
  const tick = ref(0);

  const env: ToolEnv = {
    project,
    view,
    ui,
    engine: geometryEngine,
    setPreview: (p) => {
      preview.value = p;
      tick.value++;
    },
    setTool: (id) => setTool(id),
    openPortMenu: (m) => {
      portMenu.value = m;
    },
    closePortMenu: () => {
      portMenu.value = null;
    },
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
    connect: new ConnectTool(env),
    turnout: new TurnoutTool(env),
    crossing: new CrossingTool(env),
    'bg-scale': new BackgroundScaleTool(env),
    'bg-move': new BackgroundMoveTool(env),
  };

  const active = computed(() => tools[activeId.value]);
  const hint = computed(() => {
    void tick.value;
    return active.value.hint();
  });

  // Angre/gjør om/åpne endrer modellen under et verktøy som venter på neste klikk (f.eks. valgt
  // referansespor): avbryt da, så verktøyet ikke jobber mot objekter som ikke lenger finnes.
  watch(
    () => project.historyEpoch,
    () => {
      portMenu.value = null;
      tools[activeId.value].cancel();
      tick.value++;
    },
  );

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
    const found = geometryEngine.snap(project.trackRefs, {
      cursor: world,
      toleranceM: view.snapToleranceM,
      kinds: view.activeSnapKinds,
      reference: t.snapReference,
      gridStepM: view.grid.minor,
      excludeIds: t.snapExclude,
    });
    // Endepunkter i sporene vinner; ellers kan verktøyet snappe til bakgrunnens hjørner.
    if (found && found.kind !== 'grid') return found;
    const extra = view.snapOn.endpoint ? t.extraSnap?.(world, view.snapToleranceM) : null;
    if (extra) {
      return {
        kind: 'endpoint' as const,
        point: extra,
        distanceM: Math.hypot(extra[0] - world[0], extra[1] - world[1]),
      };
    }
    return found;
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

  /** Menyvalg i portmenyen (Koble-verktøyet). */
  function choosePortAction(id: string) {
    const t = tools.connect as ConnectTool;
    portMenu.value = null;
    t.menuChoice(id);
    tick.value++;
  }
  function dismissPortMenu() {
    if (!portMenu.value) return;
    portMenu.value = null;
    (tools.connect as ConnectTool).menuClosed();
    tick.value++;
  }

  return {
    tools,
    portMenu,
    choosePortAction,
    dismissPortMenu,
    activeId,
    active,
    hint,
    preview,
    setTool,
    snapAt,
    dispatch,
    key,
    escape,
    env,
  };
}

export type ToolController = ReturnType<typeof createToolController>;

let instance: ToolController | null = null;
export function useTools(): ToolController {
  return (instance ??= createToolController());
}
