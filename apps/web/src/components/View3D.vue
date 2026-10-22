<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  findTurnoutDefinition,
  isCrossing,
  isTrack,
  isTurnout,
  turnoutPortsFor,
  CROSSING_PORTS,
} from '@railcad/domain';
import { geometryEngine as engine } from '../engine';
import { fmt, portLabel } from '../format';
import { buildSceneModel } from '../rendering/scene-model';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';

const project = useProjectStore();
const ui = useUiStore();
// Testkrok (kun utviklingsserver): velg et objekt uten museklikk i WebGL-flaten.
if (import.meta.env.DEV) {
  const w = window as unknown as {
    __v3select?: (id: string | null) => void;
    __v3point?: (id: string) => { x: number; y: number } | null;
  };
  w.__v3select = (id) => handle?.select(id);
  w.__v3point = (id) => handle?.screenPointOf(id) ?? null;
}
const host = ref<HTMLElement | null>(null);
const exaggeration = ref(10);
const status = ref('');
const pickedId = ref<string | null>(null);
/** Informasjon om valgt objekt (skrivebeskyttet; ingenting endres). */
const info = computed(() => {
  const o = pickedId.value ? project.byId.get(pickedId.value) : undefined;
  if (!o) return null;
  const rows: Array<[string, string]> = [['ID', o.id]];
  let title = o.id;
  let ports: string[] = [];
  if (isTrack(o)) {
    const g = o.geometry;
    title = g.kind === 'line' ? 'Rett spor' : 'Sirkelkurve';
    rows.push(['Lengde', `${fmt(engine.length(g), 3)} m`]);
    if (g.kind === 'arc')
      rows.push([
        'Radius',
        `${fmt(Math.abs(g.signedRadiusM), 3)} m ${g.signedRadiusM > 0 ? '(venstre)' : '(høyre)'}`,
      ]);
    ports = ['start', 'end'];
  } else if (isTurnout(o)) {
    const def = findTurnoutDefinition(o.turnout.catalogId, project.customTurnouts);
    title = def?.name ?? o.turnout.catalogId;
    rows.push(['Status', def?.verificationLabel ?? 'ukjent type']);
    ports = def ? turnoutPortsFor(def) : [];
  } else if (isCrossing(o)) {
    title = o.crossing.slip ? 'Kryssveksel' : 'Sporkryss';
    rows.push(
      ['Krysningsforhold', `1:${fmt(o.crossing.ratioN, 2)}`],
      ['Status', 'Brukerdefinert – ikke verifisert'],
    );
    ports = [...CROSSING_PORTS];
  }
  const z = project.elevations.effective;
  for (const p of ports) {
    const v = z.get(`${o.id}:${p}`);
    rows.push([`Kote ${portLabel(p)}`, v === undefined ? 'ukjent' : `${fmt(v, 3)} m`]);
  }
  if (isTrack(o)) {
    const a = z.get(`${o.id}:start`);
    const b = z.get(`${o.id}:end`);
    if (a !== undefined && b !== undefined)
      rows.push(['Stigning', `${fmt(((b - a) / engine.length(o.geometry)) * 1000, 2)} ‰`]);
  }
  return { title, rows };
});
const stats = ref({ lines: 0, unknown: 0 });

interface Handle {
  setExaggeration(v: number): void;
  select(id: string | null): void;
  setView(mode: 'fit' | 'top' | 'side'): void;
  screenPointOf(id: string): { x: number; y: number } | null;
  dispose(): void;
}
let handle: Handle | null = null;

async function start() {
  status.value = 'Laster 3D …';
  const model = buildSceneModel(project.objects, project.segmentElevationsOf, (id) =>
    findTurnoutDefinition(id, project.customTurnouts),
  );
  const lines = model.lines;
  stats.value = {
    lines: lines.length,
    unknown: lines.filter((l) => l.points.some((p) => p.z === null)).length,
  };
  await nextTick();
  if (!host.value) return;
  try {
    const { createScene } = await import('../rendering/three-scene');
    handle = createScene(host.value, model, exaggeration.value, (id) => (pickedId.value = id));
    status.value = '';
  } catch (e) {
    status.value = `Kunne ikke starte 3D (${(e as Error).message}). Nettleseren støtter kanskje ikke WebGL.`;
  }
}
function stop() {
  handle?.dispose();
  handle = null;
  pickedId.value = null;
}
watch(
  () => ui.view3dOpen,
  (open) => (open ? start() : stop()),
);
watch(exaggeration, (v) => handle?.setExaggeration(v));
onBeforeUnmount(stop);
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
      <div class="views">
        <button class="btn secondary" data-testid="v3-view-fit" @click="handle?.setView('fit')">
          Oversikt
        </button>
        <button class="btn secondary" data-testid="v3-view-top" @click="handle?.setView('top')">
          Rett ovenfra
        </button>
        <button class="btn secondary" data-testid="v3-view-side" @click="handle?.setView('side')">
          Fra siden
        </button>
      </div>
      <div class="stage">
        <div ref="host" class="canvas" data-testid="v3-canvas" />
        <aside v-if="info" class="info" data-testid="v3-info">
          <b data-testid="v3-info-title">{{ info.title }}</b>
          <dl>
            <template v-for="[k, v] in info.rows" :key="k">
              <dt>{{ k }}</dt>
              <dd>{{ v }}</dd>
            </template>
          </dl>
        </aside>
      </div>
      <p v-if="status" class="muted" data-testid="v3-status">{{ status }}</p>
      <p class="muted" style="font-size: 12px" data-testid="v3-stats">
        {{ stats.lines }} akser, {{ stats.unknown }} med ukjent kote. Dra = roter · høyreknapp =
        flytt · hjul = zoom · klikk på skinne eller sporbunn = informasjon. Sporbygningen er
        skjematisk (sporvidde 1,435 m, sviller hver 0,6 m). Vekseldeler (tunger, hjerte,
        ledeskinner, stillverk, stagstenger og vekselsviller) er <b>illustrative</b>: generiske
        proporsjoner utledet av aksene, ikke produktgeometri.
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
.views {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.stage {
  position: relative;
}
.stage .canvas {
  margin-bottom: 8px;
}
.info {
  position: absolute;
  top: 8px;
  right: 8px;
  max-width: 260px;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.info dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  margin: 6px 0 0;
}
.info dt {
  color: var(--text-dim);
}
.info dd {
  margin: 0;
}
.slider {
  display: grid;
  gap: 4px;
  margin: 6px 0;
}
</style>
