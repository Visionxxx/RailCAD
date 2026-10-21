<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { collectPolylines, type Polyline3D } from '../rendering/scene3d';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';

const project = useProjectStore();
const ui = useUiStore();
const host = ref<HTMLElement | null>(null);
const exaggeration = ref(10);
const status = ref('');
const stats = ref({ lines: 0, unknown: 0 });

interface Handle {
  setExaggeration(v: number): void;
  dispose(): void;
}
let handle: Handle | null = null;

async function start() {
  status.value = 'Laster 3D …';
  const lines = collectPolylines(project.objects, project.segmentElevationsOf);
  stats.value = {
    lines: lines.length,
    unknown: lines.filter((l) => l.points.some((p) => p.z === null)).length,
  };
  await nextTick();
  if (!host.value) return;
  try {
    const { createScene } = await import('../rendering/three-scene');
    handle = createScene(host.value, lines, exaggeration.value);
    status.value = '';
  } catch (e) {
    status.value = `Kunne ikke starte 3D (${(e as Error).message}). Nettleseren støtter kanskje ikke WebGL.`;
  }
}
function stop() {
  handle?.dispose();
  handle = null;
}
watch(
  () => ui.view3dOpen,
  (open) => (open ? start() : stop()),
);
watch(exaggeration, (v) => handle?.setExaggeration(v));
onBeforeUnmount(stop);
void (null as unknown as Polyline3D);
</script>

<template>
  <div v-if="ui.view3dOpen" class="backdrop" @keydown.esc="ui.view3dOpen = false">
    <div
      class="dialog v3d"
      role="dialog"
      aria-modal="true"
      aria-labelledby="v3-title"
      data-testid="view3d"
    >
      <h2 id="v3-title">3D-oversikt</h2>
      <p class="muted" style="font-size: 12px" data-testid="v3-note">
        Skrivebeskyttet oversikt av sporakser med kote fra portene. Høyden er <b>overdrevet</b> (se
        skyveren) og skal ikke brukes til å måle. Spor uten kote tegnes på nivå 0 i grått. Ikke
        vurdert mot regelverk.
      </p>
      <label class="slider"
        >Vertikal overdrivelse: ×{{ exaggeration }}
        <input
          v-model.number="exaggeration"
          type="range"
          min="1"
          max="100"
          step="1"
          data-testid="v3-exaggeration"
      /></label>
      <div ref="host" class="canvas" data-testid="v3-canvas" />
      <p v-if="status" class="muted" data-testid="v3-status">{{ status }}</p>
      <p class="muted" style="font-size: 12px" data-testid="v3-stats">
        {{ stats.lines }} akser, {{ stats.unknown }} med ukjent kote. Dra = roter · høyreknapp =
        flytt · hjul = zoom.
      </p>
      <div class="actions">
        <button class="btn secondary" data-testid="v3-close" @click="ui.view3dOpen = false">
          Lukk
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.v3d {
  width: min(960px, 96vw);
}
.canvas {
  height: min(520px, 60vh);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 8px;
}
.slider {
  display: grid;
  gap: 4px;
  margin: 6px 0;
}
</style>
