<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { validateGeometry, type TrackGeometry } from '@railcad/domain';
import { TOLERANCES } from '@railcad/geometry-api';
import { geometryEngine as engine } from '../engine';
import { degToRad, fmt, parseNumber } from '../format';
import { useProjectStore } from '../stores/project';
import { useTools } from '../tools/controller';
import type { RotateTool } from '../tools/operations';
import { useViewStore } from '../stores/view';

const ctrl = useTools();
const project = useProjectStore();
const view = useViewStore();

const lineForm = reactive({ x: '0', y: '0', heading: '0', length: '' });
const arcForm = reactive({ x: '0', y: '0', heading: '0', radius: '', side: 'left', sweep: '' });
const parallelText = ref(fmt(view.parallelDistanceM));
const rotateText = ref('');
const error = ref('');

const toolId = computed(() => ctrl.activeId.value);

/** Leser alle felt; returnerer tallene eller setter en feilmelding og null. */
function readAll(fields: Record<string, string>, names: Record<string, string>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [key, label] of Object.entries(names)) {
    const n = parseNumber(fields[key] ?? '');
    if (n === null) {
      error.value = `${label}: oppgi et gyldig tall.`;
      return null;
    }
    out[key] = n;
  }
  return out;
}

function commit(g: TrackGeometry) {
  const problems = validateGeometry(g);
  if (!problems.length && engine.length(g) < TOLERANCES.minSegmentLengthM) problems.push('Sporet blir for kort.');
  if (problems.length) {
    error.value = problems[0] ?? '';
    return;
  }
  error.value = '';
  project.addTrack(g);
}

function createLine() {
  const v = readAll(lineForm, { x: 'Start X', y: 'Start Y', heading: 'Retning', length: 'Lengde' });
  if (!v) return;
  commit({ kind: 'line', start: [v.x!, v.y!], headingRad: degToRad(v.heading!), lengthM: v.length! });
}

function createArc() {
  const v = readAll(arcForm, { x: 'Start X', y: 'Start Y', heading: 'Retning', radius: 'Radius', sweep: 'Sveipvinkel' });
  if (!v) return;
  if (v.radius! <= 0) {
    error.value = 'Radius må være større enn 0 (velg Venstre/Høyre for kurveretning).';
    return;
  }
  commit({
    kind: 'arc', start: [v.x!, v.y!], headingRad: degToRad(v.heading!),
    signedRadiusM: (arcForm.side === 'left' ? 1 : -1) * v.radius!, sweepRad: degToRad(v.sweep!),
  });
}

function setParallelDistance() {
  const n = parseNumber(parallelText.value);
  if (n === null || n <= 0) {
    error.value = 'Sporavstand må være et tall større enn 0.';
    return;
  }
  error.value = '';
  view.parallelDistanceM = n;
}

const rotateTool = computed(() => {
  void ctrl.hint.value;
  return ctrl.tools.rotate as RotateTool;
});
function applyRotation() {
  const n = parseNumber(rotateText.value);
  if (n === null) {
    error.value = 'Vinkel: oppgi et gyldig tall (grader, mot klokka).';
    return;
  }
  error.value = '';
  rotateTool.value.applyDegrees(n);
}
</script>

<template>
  <form v-if="toolId === 'line'" class="tool-options" data-testid="options-line" @submit.prevent="createLine" @pointerdown.stop>
    <span class="title">Nytt rett spor</span>
    <label>Start X (m)<input v-model="lineForm.x" data-testid="new-x" inputmode="decimal" /></label>
    <label>Start Y (m)<input v-model="lineForm.y" data-testid="new-y" inputmode="decimal" /></label>
    <label>Retning (°)<input v-model="lineForm.heading" data-testid="new-heading" inputmode="decimal" /></label>
    <label>Lengde (m)<input v-model="lineForm.length" data-testid="new-length" inputmode="decimal" /></label>
    <button class="btn" type="submit" data-testid="create-line">Opprett</button>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>

  <form v-else-if="toolId === 'arc'" class="tool-options" data-testid="options-arc" @submit.prevent="createArc" @pointerdown.stop>
    <span class="title">Ny sirkelkurve</span>
    <label>Start X (m)<input v-model="arcForm.x" data-testid="new-x" inputmode="decimal" /></label>
    <label>Start Y (m)<input v-model="arcForm.y" data-testid="new-y" inputmode="decimal" /></label>
    <label>Retning (°)<input v-model="arcForm.heading" data-testid="new-heading" inputmode="decimal" /></label>
    <label>Radius (m)<input v-model="arcForm.radius" data-testid="new-radius" inputmode="decimal" /></label>
    <label>Kurveretning
      <select v-model="arcForm.side" data-testid="new-side">
        <option value="left">Venstre</option>
        <option value="right">Høyre</option>
      </select>
    </label>
    <label>Sveip (°)<input v-model="arcForm.sweep" data-testid="new-sweep" inputmode="decimal" /></label>
    <button class="btn" type="submit" data-testid="create-arc">Opprett</button>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>

  <form v-else-if="toolId === 'parallel'" class="tool-options" data-testid="options-parallel" @submit.prevent="setParallelDistance" @pointerdown.stop>
    <span class="title">Parallelt spor</span>
    <label>Sporavstand (m)<input v-model="parallelText" data-testid="parallel-distance" inputmode="decimal" @change="setParallelDistance" /></label>
    <label>Side
      <select v-model="view.parallelSide" data-testid="parallel-side">
        <option value="auto">Etter musepeker</option>
        <option value="left">Venstre</option>
        <option value="right">Høyre</option>
      </select>
    </label>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>

  <form v-else-if="toolId === 'rotate'" class="tool-options" data-testid="options-rotate" @submit.prevent="applyRotation" @pointerdown.stop>
    <span class="title">Roter</span>
    <label>Vinkel (°, mot klokka)<input v-model="rotateText" data-testid="rotate-angle" inputmode="decimal" /></label>
    <button class="btn" type="submit" data-testid="rotate-apply" :disabled="!rotateTool.hasPivot">Roter</button>
    <span class="muted">Klikk rotasjonspunkt først.</span>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>
</template>
