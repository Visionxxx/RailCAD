import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import type { SnapKind } from '@railcad/geometry-api';
import {
  fitBounds,
  gridSteps,
  panBy,
  visibleWorldRect,
  zoomAt,
  type ViewState,
} from '../rendering/viewport';
import { unionBounds } from '../rendering/viewport';
import { backgroundWorldBounds } from '../rendering/background';
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
  /** Sporkryss: krysningsforhold 1:n og lengde fra M til hver ende (brukerdefinert – ingen åpne norske mål). */
  const crossingRatioN = ref(9);
  const crossingHalfLengthM = ref(17);
  /** Kryssveksel: ingen (vanlig sporkryss), enkel A→B, enkel B→A eller dobbel – og buenes radius (brukerdefinert). */
  /** Sovitet sporkryss: veksltype, sporavstand (TRV nevner 4700 mm for sporsløyfe) og midtkryssets halve lengde (brukerdefinert). */
  const scissorsTurnoutId = ref('trv-60E1-1:9-R300-EVF');
  const scissorsSpacingM = ref(4.7);
  const scissorsHalfLengthM = ref(3);
  const crossingSlip = ref<'none' | 'ab' | 'ba' | 'both'>('none');
  const crossingSlipRadiusM = ref(200);
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
    // «Tilpass visning» omfatter alt som vises: spor, sporveksler og synlige bakgrunner.
    const b = unionBounds([
      ...project.trackRefs.map((t) => cachedBounds(t.geometry)),
      ...project.backgrounds.filter((bg) => bg.visible).map(backgroundWorldBounds),
    ]);
    apply(fitBounds(view, b));
  }
  /** Sørger for at et nytt objekt er synlig: hvis det ligger utenfor skjermen, flyttes/zoomes utsnittet. */
  function reveal(b: { minX: number; minY: number; maxX: number; maxY: number }) {
    const r = visibleWorldRect(view);
    const intersects = b.minX <= r.maxX && b.maxX >= r.minX && b.minY <= r.maxY && b.maxY >= r.minY;
    if (intersects) return;
    const fits = b.maxX - b.minX <= r.maxX - r.minX && b.maxY - b.minY <= r.maxY - r.minY;
    if (fits) {
      view.cx = (b.minX + b.maxX) / 2;
      view.cy = (b.minY + b.maxY) / 2;
    } else {
      apply(fitBounds(view, b));
    }
  }
  /** Sentrerer utsnittet på et punkt og sørger for at det er zoomet nær nok til å se detaljer. */
  function focusPoint(p: readonly [number, number], minScale = 4) {
    view.cx = p[0];
    view.cy = p[1];
    if (view.scale < minScale) view.scale = minScale;
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
    crossingRatioN,
    crossingHalfLengthM,
    scissorsTurnoutId,
    scissorsSpacingM,
    scissorsHalfLengthM,
    crossingSlip,
    crossingSlipRadiusM,
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
    focusPoint,
    reveal,
    setTheme,
  };
});
