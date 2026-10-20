import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import type { SnapKind } from '@railcad/geometry-api';
import { fitBounds, gridSteps, panBy, zoomAt, type ViewState } from '../rendering/viewport';
import { unionBounds } from '../rendering/viewport';
import { cachedBounds } from '../rendering/paths';
import { useProjectStore } from './project';

export type Theme = 'dark' | 'light';

/** Snap-radius i skjermpiksler. Omregnes til meter ved bruk – lagres aldri i modellen. */
export const SNAP_RADIUS_PX = 12;
export const PICK_RADIUS_PX = 8;

export const SNAP_LABELS: Record<SnapKind, string> = {
  endpoint: 'Endepunkt',
  center: 'Senter',
  tangent: 'Tangent',
  nearest: 'Nærmeste',
  grid: 'Rutenett',
};

function loadTheme(): Theme {
  try {
    return localStorage.getItem('railcad.theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export const useViewStore = defineStore('view', () => {
  const view = reactive<ViewState>({ cx: 0, cy: 0, scale: 10, width: 800, height: 600 });
  const theme = ref<Theme>(loadTheme());
  const showGrid = ref(true);
  const railView = ref(false);
  const snapOn = reactive<Record<SnapKind, boolean>>({
    endpoint: true,
    center: true,
    tangent: true,
    nearest: true,
    grid: true,
  });
  /** Parametere for parallellverktøyet (brukerstyrt – ingen faglig standardverdi). */
  const parallelDistanceM = ref(5);
  const parallelSide = ref<'auto' | 'left' | 'right'>('auto');
  /** Valgt biblioteksvekseltype og -retning for plassering (kun UI-valg). */
  const turnoutTypeId = ref('trv-60E1-1:9-R300-EVF');
  /** Valgt bakgrunn i bakgrunnspanelet (for skalering/flytting). */
  const activeBackgroundId = ref<string | null>(null);
  const turnoutHand = ref<'left' | 'right'>('left');
  /** Markørposisjon i verdenskoordinater (rå, ikke snappet). */
  const cursor = ref<readonly [number, number] | null>(null);

  const activeSnapKinds = computed(() =>
    (Object.keys(snapOn) as SnapKind[]).filter((k) => snapOn[k]),
  );
  const grid = computed(() => gridSteps(view.scale));
  const snapToleranceM = computed(() => SNAP_RADIUS_PX / view.scale);
  const pickToleranceM = computed(() => PICK_RADIUS_PX / view.scale);

  function apply(next: ViewState) {
    Object.assign(view, next);
  }
  function resize(width: number, height: number) {
    view.width = Math.max(width, 1);
    view.height = Math.max(height, 1);
  }
  function zoom(sx: number, sy: number, factor: number) {
    apply(zoomAt(view, sx, sy, factor));
  }
  function pan(dx: number, dy: number) {
    apply(panBy(view, dx, dy));
  }
  function fitAll() {
    const project = useProjectStore();
    const b = unionBounds(project.trackRefs.map((t) => cachedBounds(t.geometry)));
    apply(fitBounds(view, b));
  }
  function fitToBounds(b: { minX: number; minY: number; maxX: number; maxY: number }) {
    apply(fitBounds(view, b));
  }
  function setTheme(t: Theme) {
    theme.value = t;
    try {
      localStorage.setItem('railcad.theme', t);
    } catch {
      /* lagring kan være blokkert – temaet gjelder da kun for økten */
    }
  }

  return {
    view,
    theme,
    showGrid,
    railView,
    snapOn,
    parallelDistanceM,
    parallelSide,
    turnoutTypeId,
    turnoutHand,
    activeBackgroundId,
    cursor,
    activeSnapKinds,
    grid,
    snapToleranceM,
    pickToleranceM,
    resize,
    zoom,
    pan,
    fitAll,
    fitToBounds,
    setTheme,
  };
});
