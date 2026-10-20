<script setup lang="ts">
import { isTypingTarget } from '../dom';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, nextTick } from 'vue';
import {
  getTurnoutType,
  isCrossing,
  isDimension,
  isTrack,
  isTurnout,
  type DimensionSpec,
  type TrackGeometry,
  type Vec2,
} from '@railcad/domain';
import type { DimensionLayout, SnapResult } from '@railcad/geometry-api';
import { geometryEngine as engine } from '../engine';
import { fmt, fmtM } from '../format';
import { cachedBounds, railPaths, trackPath } from '../rendering/paths';
import { backgroundMatrix, backgroundWorldCorners, type Background } from '@railcad/domain';
import { cachedCrossingLayout, crossingBounds } from '../rendering/crossings';
import { cachedTurnoutLayout, turnoutBounds } from '../rendering/turnouts';
import {
  aciColor,
  backgroundLabels,
  backgroundPaths,
  backgroundWorldBounds,
} from '../rendering/background';
import { intersects, screenToWorld, visibleWorldRect, worldToScreen } from '../rendering/viewport';
import { useProjectStore } from '../stores/project';
import { SNAP_LABELS, useViewStore } from '../stores/view';
import { useTools } from '../tools/controller';
import type { PointerInfo } from '../tools/types';
import type { ConnectTool } from '../tools/connect';
import PortMenu from './PortMenu.vue';
import ToolOptions from './ToolOptions.vue';

const project = useProjectStore();
const viewStore = useViewStore();
const ctrl = useTools();
const host = ref<HTMLElement | null>(null);
const v = viewStore.view;

const snap = shallowRef<SnapResult | null>(null);
const cursorScreen = ref<Vec2 | null>(null);
const panning = ref(false);
const spaceHeld = ref(false);
let panLast: Vec2 = [0, 0];
let panButton = -1;

// ---------- Avledede data for tegning ----------
const selectedSet = computed(() => new Set(project.selection));
const worldRect = computed(() => visibleWorldRect(v, 40));

/** Tegnbare enheter: et spor har én akse, en sporveksel flere segmenter. */
interface Drawable {
  id: string;
  geometries: TrackGeometry[];
}
const visibleTracks = computed<Drawable[]>(() => {
  const rect = worldRect.value;
  const out: Drawable[] = [];
  for (const o of project.visibleObjects) {
    if (isTrack(o)) {
      if (intersects(cachedBounds(o.geometry), rect))
        out.push({ id: o.id, geometries: [o.geometry] });
    } else if (isCrossing(o)) {
      if (intersects(crossingBounds(o), rect)) {
        out.push({ id: o.id, geometries: cachedCrossingLayout(o).segments });
      }
    } else if (isTurnout(o)) {
      const b = turnoutBounds(o);
      const layout = cachedTurnoutLayout(o);
      if (b && layout && intersects(b, rect)) out.push({ id: o.id, geometries: layout.segments });
    }
  }
  return out;
});
/** Piksler per meter under hvilken oppstikkende etiketter og OK-ringer skjules. */
const LABEL_MIN_SCALE = 4;
const visibleTurnoutLabels = computed(() => {
  const rect = worldRect.value;
  const out: Array<{ id: string; text: string; x: number; y: number }> = [];
  for (const o of project.visibleObjects) {
    if (isCrossing(o)) {
      if (!intersects(crossingBounds(o), rect)) continue;
      if (v.scale < LABEL_MIN_SCALE && !selectedSet.value.has(o.id)) continue;
      const [x, y] = worldToScreen(v, o.crossing.position);
      out.push({
        id: o.id,
        text: `Sporkryss 1:${fmt(o.crossing.ratioN, 1)} – ikke verifisert`,
        x,
        y,
      });
      continue;
    }
    if (!isTurnout(o)) continue;
    const b = turnoutBounds(o);
    if (!b || !intersects(b, rect)) continue;
    // Ved lav zoom blir etikettene en grøt – vis dem da bare for valgt veksel.
    if (v.scale < LABEL_MIN_SCALE && !selectedSet.value.has(o.id)) continue;
    const [x, y] = worldToScreen(v, o.turnout.position);
    const name = getTurnoutType(o.turnout.catalogId)?.name ?? o.turnout.catalogId;
    out.push({ id: o.id, text: `${name} – delvis verifisert`, x, y });
  }
  return out;
});

function resolveGeometry(id: string) {
  const t = project.byId.get(id);
  return t && isTrack(t) ? t.geometry : undefined;
}

interface DimDraw {
  id: string;
  layout: DimensionLayout;
}
const dimLayouts = computed<DimDraw[]>(() => {
  const out: DimDraw[] = [];
  for (const o of project.visibleObjects) {
    if (!isDimension(o)) continue;
    const layout = engine.dimensionLayout(o.dimension, resolveGeometry);
    if (layout) out.push({ id: o.id, layout });
  }
  return out;
});
/** Synlige bakgrunner (skjult eller utenfor skjermen hoppes over). */
const visibleBackgrounds = computed<Background[]>(() => {
  const rect = worldRect.value;
  return project.backgrounds.filter((b) => b.visible && intersects(backgroundWorldBounds(b), rect));
});
const backgroundOutline = computed(() => {
  const bg = project.backgrounds.find((b) => b.id === viewStore.activeBackgroundId);
  return bg && bg.visible
    ? backgroundWorldCorners(bg)
        .map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`)
        .join('') + 'Z'
    : '';
});
/** Tekst fra DXF-bakgrunner som er stor nok til å leses (maks 400 om gangen). */
const bgLabels = computed(() => {
  const out: Array<{ key: string; text: string; x: number; y: number; px: number; deg: number }> =
    [];
  const rect = worldRect.value;
  for (const bg of visibleBackgrounds.value) {
    if (bg.kind !== 'dxf') continue;
    for (const l of backgroundLabels(bg)) {
      const px = l.heightM * v.scale;
      if (px < 5 || l.x < rect.minX || l.x > rect.maxX || l.y < rect.minY || l.y > rect.maxY)
        continue;
      const [x, y] = worldToScreen(v, [l.x, l.y]);
      out.push({ key: l.key, text: l.text, x, y, px: Math.min(px, 40), deg: -l.rotationDeg });
      if (out.length >= 400) return out;
    }
  }
  return out;
});
/** Valgboksen i skjermkoordinater. */
const boxRect = computed(() => {
  const r = ctrl.preview.value?.rect;
  if (!r) return null;
  const [x0, y0] = worldToScreen(v, r.a);
  const [x1, y1] = worldToScreen(v, r.b);
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
    crossing: r.crossing,
  };
});
const matrixOf = (b: Background) => `matrix(${backgroundMatrix(b.placement).join(' ')})`;

const visibleDims = computed(() => {
  const rect = worldRect.value;
  return dimLayouts.value.filter((d) => intersects(cachedBounds(d.layout.line), rect));
});

const previewDims = computed(() =>
  (ctrl.preview.value?.dimensions ?? [])
    .map((d) => ({ d, layout: engine.dimensionLayout(d.spec as DimensionSpec, resolveGeometry) }))
    .filter((x): x is { d: typeof x.d; layout: DimensionLayout } => !!x.layout),
);

const worldTransform = computed(
  () =>
    `matrix(${v.scale} 0 0 ${-v.scale} ${v.width / 2 - v.cx * v.scale} ${v.height / 2 + v.cy * v.scale})`,
);

const origin = computed(() => worldToScreen(v, [0, 0]));
const minorPx = computed(() => viewStore.grid.minor * v.scale);
const majorPx = computed(() => viewStore.grid.major * v.scale);

const showRails = computed(() => viewStore.railView && v.scale >= 3);
const showSleepers = computed(() => viewStore.railView && v.scale >= 6);

const gripTracks = computed(() => project.selectedObjects.filter(isTrack));
const screenEndpoints = computed(() => {
  const pts: Array<{ id: string; p: Vec2; grip: boolean }> = [];
  const grips = gripTracks.value.length === 1;
  for (const t of gripTracks.value) {
    pts.push({ id: `${t.id}-s`, p: worldToScreen(v, t.geometry.start), grip: grips });
    pts.push({
      id: `${t.id}-e`,
      p: worldToScreen(v, engine.endPose(t.geometry).point),
      grip: grips,
    });
  }
  return pts;
});

const connectionMarks = computed(() => {
  const rect = worldRect.value;
  return project.connectionResults
    .filter(
      (r) =>
        (r.status !== 'ok' || v.scale >= LABEL_MIN_SCALE) &&
        r.at &&
        r.at[0] >= rect.minX &&
        r.at[0] <= rect.maxX &&
        r.at[1] >= rect.minY &&
        r.at[1] <= rect.maxY,
    )
    .map((r) => ({ index: r.index, status: r.status, p: worldToScreen(v, r.at as Vec2) }));
});
/** Kryssende spor (uten kryss/veksel) – vises alltid; bekreftede (planskilt) dempet. */
const crossingMarks = computed(() => {
  const rect = worldRect.value;
  return project.crossingIssues
    .map((x, i) => ({ x, i }))
    .filter(
      ({ x }) =>
        !project.hiddenIds.has(x.a) &&
        !project.hiddenIds.has(x.b) &&
        x.point[0] >= rect.minX &&
        x.point[0] <= rect.maxX &&
        x.point[1] >= rect.minY &&
        x.point[1] <= rect.maxY,
    )
    .map(({ x, i }) => ({ i, acked: x.acknowledged, kind: x.kind, p: worldToScreen(v, x.point) }));
});
const freePortMarks = computed(() => {
  if (ctrl.activeId.value !== 'connect') return [];
  const rect = worldRect.value;
  return (ctrl.tools.connect as ConnectTool)
    .freePorts()
    .filter(
      (f) =>
        f.point[0] >= rect.minX &&
        f.point[0] <= rect.maxX &&
        f.point[1] >= rect.minY &&
        f.point[1] <= rect.maxY,
    )
    .map((f) => ({ key: `${f.objectId}:${f.port}`, p: worldToScreen(v, f.point) }));
});

const snapMark = computed(() => (snap.value ? worldToScreen(v, snap.value.point) : null));

function dimLabel(layout: DimensionLayout) {
  const [x, y] = worldToScreen(v, layout.labelPoint);
  return { x, y, deg: (-layout.labelAngleRad * 180) / Math.PI, text: fmtM(layout.valueM) };
}

const hudLines = computed(() => ctrl.preview.value?.hud ?? []);
const cursor = computed(() => {
  if (panning.value) return 'grabbing';
  if (spaceHeld.value) return 'grab';
  return ctrl.active.value.cursor;
});

function ghostPath(g: Parameters<typeof trackPath>[0]) {
  return trackPath(g);
}

// ---------- Pekerhendelser ----------
function pointer(e: PointerEvent | WheelEvent): PointerInfo {
  const rect = host.value!.getBoundingClientRect();
  const screen: Vec2 = [e.clientX - rect.left, e.clientY - rect.top];
  const world = screenToWorld(v, screen);
  const found = ctrl.snapAt(world);
  snap.value = found;
  return {
    button: 'button' in e ? e.button : 0,
    shift: e.shiftKey,
    screen,
    world,
    snap: found,
    point: found ? found.point : world,
  };
}

function onDown(e: PointerEvent) {
  host.value?.focus({ preventScroll: true });
  if (ctrl.portMenu.value) {
    ctrl.dismissPortMenu(); // klikk utenfor menyen lukker den uten å utføre noe
    return;
  }
  const startPan =
    e.button === 1 || (e.button === 0 && (spaceHeld.value || ctrl.activeId.value === 'pan'));
  if (startPan) {
    panning.value = true;
    panButton = e.button;
    panLast = [e.clientX, e.clientY];
    host.value?.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (e.button === 2) {
    ctrl.escape();
    return;
  }
  if (e.button !== 0) return;
  host.value?.setPointerCapture(e.pointerId);
  ctrl.dispatch('down', pointer(e));
}

function onMove(e: PointerEvent) {
  const rect = host.value!.getBoundingClientRect();
  cursorScreen.value = [e.clientX - rect.left, e.clientY - rect.top];
  viewStore.cursor = screenToWorld(v, cursorScreen.value);
  if (panning.value) {
    viewStore.pan(e.clientX - panLast[0], e.clientY - panLast[1]);
    panLast = [e.clientX, e.clientY];
    return;
  }
  ctrl.dispatch('move', pointer(e));
}

function onUp(e: PointerEvent) {
  if (panning.value && e.button === panButton) {
    panning.value = false;
    host.value?.releasePointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0) return;
  if (host.value?.hasPointerCapture(e.pointerId)) host.value.releasePointerCapture(e.pointerId);
  ctrl.dispatch('up', pointer(e));
}

function onLeave() {
  cursorScreen.value = null;
  if (!panning.value) snap.value = null;
}

/** Zoom rundt midten av tegneflaten (knappene). */
function zoomBy(k: number) {
  viewStore.zoom(v.width / 2, v.height / 2, k);
}

function onWheel(e: WheelEvent) {
  const rect = host.value!.getBoundingClientRect();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  // Pinch på pekeplate sendes som ctrl+hjul med små deltaer – forsterk så det føles likt som musehjul.
  const dy = Math.max(-240, Math.min(240, e.deltaY * unit * (e.ctrlKey ? 8 : 1)));
  viewStore.zoom(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-dy * 0.0016));
  viewStore.cursor = screenToWorld(v, [e.clientX - rect.left, e.clientY - rect.top]);
}

function onKeyDown(e: KeyboardEvent) {
  if (
    e.code === 'Space' &&
    !isTypingTarget(e) &&
    !(e.target as HTMLElement | null)?.closest?.('button')
  ) {
    spaceHeld.value = true;
    e.preventDefault();
  }
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld.value = false;
}

// ---------- Størrelse og utsnitt ----------
let observer: ResizeObserver | null = null;
function measure() {
  if (!host.value) return;
  viewStore.resize(host.value.clientWidth, host.value.clientHeight);
}
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(host.value!);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
});
watch(
  () => project.loadCount,
  async () => {
    await nextTick();
    measure();
    viewStore.fitAll();
  },
);
</script>

<template>
  <div
    ref="host"
    class="viewport"
    tabindex="0"
    role="application"
    aria-label="Tegneflate"
    data-testid="viewport"
    :data-scale="v.scale"
    :data-cx="v.cx"
    :data-cy="v.cy"
    :data-width="v.width"
    :data-height="v.height"
    :style="{ cursor }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @pointerleave="onLeave"
    @wheel.prevent="onWheel"
    @contextmenu.prevent
  >
    <svg :width="v.width" :height="v.height" :viewBox="`0 0 ${v.width} ${v.height}`">
      <defs>
        <pattern
          id="pat-minor"
          :width="minorPx"
          :height="minorPx"
          patternUnits="userSpaceOnUse"
          :x="origin[0]"
          :y="origin[1]"
        >
          <path class="g-minor" :d="`M0 0V${minorPx}M0 0H${minorPx}`" />
        </pattern>
        <pattern
          id="pat-major"
          :width="majorPx"
          :height="majorPx"
          patternUnits="userSpaceOnUse"
          :x="origin[0]"
          :y="origin[1]"
        >
          <path class="g-major" :d="`M0 0V${majorPx}M0 0H${majorPx}`" />
        </pattern>
      </defs>

      <g v-if="viewStore.showGrid" aria-hidden="true">
        <rect width="100%" height="100%" fill="url(#pat-minor)" />
        <rect width="100%" height="100%" fill="url(#pat-major)" />
        <line class="axis-x" x1="0" :y1="origin[1]" :x2="v.width" :y2="origin[1]" />
        <line class="axis-y" :x1="origin[0]" y1="0" :x2="origin[0]" :y2="v.height" />
      </g>

      <!-- Verdenslag: geometri i meter, Y opp. Streker har fast pikselbredde. -->
      <g :transform="worldTransform" data-testid="world">
        <!-- Referansebakgrunner ligger under sporene. -->
        <g
          v-for="bg in visibleBackgrounds"
          :key="bg.id"
          :opacity="bg.opacity"
          :data-testid="`background-${bg.id}`"
          :data-kind="bg.kind"
        >
          <g :transform="matrixOf(bg)">
            <template v-if="bg.kind === 'dxf'">
              <path
                v-for="p in backgroundPaths(bg)"
                :key="p.layer"
                class="bg-path"
                :d="p.d"
                :stroke="aciColor(p.color)"
                vector-effect="non-scaling-stroke"
              />
            </template>
            <image
              v-else
              :href="bg.dataUrl"
              x="0"
              y="0"
              :width="bg.widthPx"
              :height="bg.heightPx"
              preserveAspectRatio="none"
              :transform="`translate(0 ${bg.heightPx}) scale(1 -1)`"
            />
          </g>
        </g>
        <path
          v-if="backgroundOutline"
          class="bg-outline"
          :d="backgroundOutline"
          vector-effect="non-scaling-stroke"
        />
        <g
          v-for="t in visibleTracks"
          :key="t.id"
          :class="{ 't-selected': selectedSet.has(t.id) }"
          :data-track="t.id"
        >
          <template v-for="(g, gi) in t.geometries" :key="gi">
            <path
              v-if="selectedSet.has(t.id) || ctrl.preview.value?.hoverId === t.id"
              :class="[
                't-halo',
                {
                  hover: !selectedSet.has(t.id),
                  danger:
                    ctrl.preview.value?.hoverKind === 'danger' &&
                    ctrl.preview.value?.hoverId === t.id,
                },
              ]"
              :d="trackPath(g)"
              vector-effect="non-scaling-stroke"
            />
            <path
              v-if="showSleepers"
              class="t-sleepers"
              :d="trackPath(g)"
              :stroke-width="2.6"
              stroke-dasharray="0.25 0.35"
            />
            <template v-if="showRails">
              <path
                v-for="(d, i) in railPaths(g)"
                :key="i"
                class="t-rail"
                :d="d"
                vector-effect="non-scaling-stroke"
              />
            </template>
            <path class="t-axis" :d="trackPath(g)" vector-effect="non-scaling-stroke" />
          </template>
        </g>

        <g v-for="d in visibleDims" :key="d.id" :class="{ 'd-selected': selectedSet.has(d.id) }">
          <path class="d-line" :d="trackPath(d.layout.line)" vector-effect="non-scaling-stroke" />
          <path
            v-for="(ext, i) in d.layout.extensionLines"
            :key="i"
            class="d-ext"
            :d="`M${ext[0][0]} ${ext[0][1]}L${ext[1][0]} ${ext[1][1]}`"
            vector-effect="non-scaling-stroke"
          />
        </g>

        <g v-if="ctrl.preview.value">
          <path
            v-for="(gh, i) in ctrl.preview.value.ghosts"
            :key="`g${i}`"
            :class="['ghost', { invalid: !gh.valid }]"
            :d="ghostPath(gh.geometry)"
            vector-effect="non-scaling-stroke"
          />
          <path
            v-for="(g, i) in ctrl.preview.value.guides ?? []"
            :key="`u${i}`"
            class="guide"
            :d="`M${g[0][0]} ${g[0][1]}L${g[1][0]} ${g[1][1]}`"
            vector-effect="non-scaling-stroke"
          />
          <template v-for="(pd, i) in previewDims" :key="`pd${i}`">
            <path class="ghost" :d="trackPath(pd.layout.line)" vector-effect="non-scaling-stroke" />
            <path
              v-for="(ext, j) in pd.layout.extensionLines"
              :key="j"
              class="guide"
              :d="`M${ext[0][0]} ${ext[0][1]}L${ext[1][0]} ${ext[1][1]}`"
              vector-effect="non-scaling-stroke"
            />
          </template>
        </g>
      </g>

      <!-- Skjermlag: tekst, grep og markører i piksler. -->
      <g>
        <text
          v-for="l in bgLabels"
          :key="l.key"
          class="bg-text"
          :transform="`translate(${l.x} ${l.y}) rotate(${l.deg})`"
          :font-size="l.px"
        >
          {{ l.text }}
        </text>
        <text
          v-for="t in visibleTurnoutLabels"
          :key="t.id"
          class="t-label"
          :x="t.x + 8"
          :y="t.y - 10"
          :data-testid="`turnout-label-${t.id}`"
        >
          {{ t.text }}
        </text>
        <text
          v-for="d in visibleDims"
          :key="d.id"
          :class="['d-text', { selected: selectedSet.has(d.id) }]"
          :transform="`translate(${dimLabel(d.layout).x} ${dimLabel(d.layout).y}) rotate(${dimLabel(d.layout).deg})`"
          dy="-5"
          :data-testid="`dim-label-${d.id}`"
        >
          {{ dimLabel(d.layout).text }}
        </text>
        <text
          v-for="(pd, i) in previewDims"
          :key="`pt${i}`"
          class="d-text"
          :transform="`translate(${dimLabel(pd.layout).x} ${dimLabel(pd.layout).y}) rotate(${dimLabel(pd.layout).deg})`"
          dy="-5"
        >
          {{ dimLabel(pd.layout).text }}
        </text>

        <g v-for="e in screenEndpoints" :key="e.id">
          <rect
            v-if="e.grip"
            class="grip"
            :x="e.p[0] - 5"
            :y="e.p[1] - 5"
            width="10"
            height="10"
            data-testid="grip"
          />
          <rect v-else class="endmark" :x="e.p[0] - 2.5" :y="e.p[1] - 2.5" width="5" height="5" />
        </g>

        <g v-if="ctrl.preview.value?.pivot">
          <circle
            class="snap-mark"
            :cx="worldToScreen(v, ctrl.preview.value.pivot)[0]"
            :cy="worldToScreen(v, ctrl.preview.value.pivot)[1]"
            r="6"
          />
        </g>

        <g
          v-for="m in crossingMarks"
          :key="`xm${m.i}`"
          :class="['cross-mark', { acked: m.acked }]"
          :data-testid="`crossing-mark-${m.i}`"
          :data-kind="m.kind"
          :data-acked="m.acked"
        >
          <circle :cx="m.p[0]" :cy="m.p[1]" r="9" />
          <path
            :d="`M${m.p[0] - 4} ${m.p[1] - 4}L${m.p[0] + 4} ${m.p[1] + 4}M${m.p[0] + 4} ${m.p[1] - 4}L${m.p[0] - 4} ${m.p[1] + 4}`"
          />
        </g>
        <circle
          v-for="m in connectionMarks"
          :key="`cm${m.index}`"
          :class="['conn-mark', m.status]"
          :cx="m.p[0]"
          :cy="m.p[1]"
          r="6"
          :data-testid="`conn-mark-${m.index}`"
          :data-status="m.status"
        />
        <circle
          v-for="f in freePortMarks"
          :key="f.key"
          class="port-free"
          :cx="f.p[0]"
          :cy="f.p[1]"
          r="6"
          data-testid="free-port"
        />
        <circle
          v-if="ctrl.preview.value?.portHover"
          class="port-hover"
          :cx="worldToScreen(v, ctrl.preview.value.portHover)[0]"
          :cy="worldToScreen(v, ctrl.preview.value.portHover)[1]"
          r="9"
        />

        <rect
          v-if="boxRect"
          :class="['select-box', { crossing: boxRect.crossing }]"
          :x="boxRect.x"
          :y="boxRect.y"
          :width="boxRect.w"
          :height="boxRect.h"
          data-testid="select-box"
        />

        <g v-if="snap && snapMark" data-testid="snap-marker" :data-kind="snap.kind">
          <rect
            v-if="snap.kind === 'endpoint'"
            class="snap-mark"
            :x="snapMark[0] - 6"
            :y="snapMark[1] - 6"
            width="12"
            height="12"
          />
          <circle
            v-else-if="snap.kind === 'center'"
            class="snap-mark"
            :cx="snapMark[0]"
            :cy="snapMark[1]"
            r="6"
          />
          <path
            v-else-if="snap.kind === 'tangent'"
            class="snap-mark"
            :d="`M${snapMark[0] - 6} ${snapMark[1] + 7}H${snapMark[0] + 6}M${snapMark[0]} ${snapMark[1] - 1}m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0`"
          />
          <path
            v-else-if="snap.kind === 'nearest'"
            class="snap-mark"
            :d="`M${snapMark[0] - 6} ${snapMark[1] - 6}L${snapMark[0] + 6} ${snapMark[1] + 6}M${snapMark[0] + 6} ${snapMark[1] - 6}L${snapMark[0] - 6} ${snapMark[1] + 6}`"
          />
          <path
            v-else
            class="snap-mark"
            :d="`M${snapMark[0] - 5} ${snapMark[1]}H${snapMark[0] + 5}M${snapMark[0]} ${snapMark[1] - 5}V${snapMark[1] + 5}`"
          />
          <text class="snap-text" :x="snapMark[0] + 10" :y="snapMark[1] - 8">
            {{ SNAP_LABELS[snap.kind] }}
          </text>
        </g>

        <g v-if="hudLines.length && cursorScreen" data-testid="hud">
          <text
            v-for="(line, i) in hudLines"
            :key="i"
            :class="['hud', { invalid: ctrl.preview.value?.hudValid === false }]"
            :x="cursorScreen[0] + 16"
            :y="cursorScreen[1] + 24 + i * 15"
          >
            {{ line }}
          </text>
        </g>
      </g>
    </svg>

    <ToolOptions />
    <PortMenu />
    <div class="zoom-controls" role="group" aria-label="Zoom" @pointerdown.stop>
      <button aria-label="Zoom inn" title="Zoom inn" data-testid="zoom-in" @click="zoomBy(1.4)">
        +
      </button>
      <button aria-label="Zoom ut" title="Zoom ut" data-testid="zoom-out" @click="zoomBy(1 / 1.4)">
        −
      </button>
      <button
        aria-label="Tilpass visning (F)"
        title="Tilpass visning (F)"
        data-testid="zoom-fit"
        @click="viewStore.fitAll()"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.viewport :deep(.tool-options) {
  cursor: default;
}
</style>
