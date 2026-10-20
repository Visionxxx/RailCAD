<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { validateGeometry, type TrackGeometry } from '@railcad/domain';
import { TOLERANCES } from '@railcad/geometry-api';
import {
  TURNOUT_CATALOG,
  TURNOUT_CATALOG_REVISION,
  getTurnoutType,
  isCrossing,
  isTurnout,
} from '@railcad/domain';
import { cachedBounds } from '../rendering/paths';
import { crossingBounds } from '../rendering/crossings';
import { turnoutBounds } from '../rendering/turnouts';
import { geometryEngine as engine } from '../engine';
import { degToRad, fmt, parseNumber } from '../format';
import { useProjectStore } from '../stores/project';
import { useTools } from '../tools/controller';
import type { BackgroundScaleTool } from '../tools/background';
import type { ConnectTool } from '../tools/connect';
import type { RotateTool } from '../tools/operations';
import { useViewStore } from '../stores/view';

const ctrl = useTools();
const project = useProjectStore();
const view = useViewStore();

const lineForm = reactive({ x: '0', y: '0', heading: '0', length: '' });
const arcForm = reactive({ x: '0', y: '0', heading: '0', radius: '', side: 'left', sweep: '' });
const turnoutForm = reactive({ x: '0', y: '0', heading: '0' });
const turnoutType = computed(() => getTurnoutType(view.turnoutTypeId));
function createTurnoutNumeric() {
  const v = readAll(turnoutForm, { x: 'X', y: 'Y', heading: 'Retning' });
  if (!v || !turnoutType.value) return;
  error.value = '';
  const id = project.addTurnout({
    catalogId: turnoutType.value.catalogId,
    catalogRevision: TURNOUT_CATALOG_REVISION,
    position: [v.x!, v.y!],
    headingRad: degToRad(v.heading!),
    hand: view.turnoutHand,
  });
  const created = project.byId.get(id);
  const b = created && isTurnout(created) ? turnoutBounds(created) : null;
  if (b) view.reveal(b);
}
const crossingForm = reactive({ x: '0', y: '0', heading: '0', ratio: '9', half: '17' });
function syncCrossingParams() {
  const r = parseNumber(crossingForm.ratio);
  const h = parseNumber(crossingForm.half);
  if (r !== null && r >= 1.5 && r <= 100) view.crossingRatioN = r;
  if (h !== null && h > 0 && h <= 1e4) view.crossingHalfLengthM = h;
}
function createCrossingNumeric() {
  const v = readAll(crossingForm, {
    x: 'X (M)',
    y: 'Y (M)',
    heading: 'Retning',
    ratio: 'Forhold 1:n',
    half: 'Lengde fra M',
  });
  if (!v) return;
  if (!(v.ratio! >= 1.5 && v.ratio! <= 100)) {
    error.value = 'Krysningsforholdet 1:n må ha n mellom 1,5 og 100.';
    return;
  }
  if (!(v.half! > 0 && v.half! <= 1e4)) {
    error.value = 'Lengden fra M til enden må være mellom 0 og 10 000 m.';
    return;
  }
  error.value = '';
  syncCrossingParams();
  const id = project.addCrossing({
    position: [v.x!, v.y!],
    headingRad: degToRad(v.heading!),
    ratioN: v.ratio!,
    halfLengthM: v.half!,
  });
  const created = project.byId.get(id);
  if (created && isCrossing(created)) view.reveal(crossingBounds(created));
}
const parallelText = ref(fmt(view.parallelDistanceM));
const rotateText = ref('');
const error = ref('');

const toolId = computed(() => ctrl.activeId.value);
// Feilmeldingen hører til ett skjema – ikke la den henge igjen når man bytter verktøy.
watch(toolId, () => (error.value = ''));

/** Leser alle felt; returnerer tallene eller setter en feilmelding og null. */
function readAll(
  fields: Record<string, string>,
  names: Record<string, string>,
): Record<string, number> | null {
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
  if (!problems.length && engine.length(g) < TOLERANCES.minSegmentLengthM)
    problems.push('Sporet blir for kort.');
  if (problems.length) {
    error.value = problems[0] ?? '';
    return;
  }
  error.value = '';
  project.addTrack(g);
  view.reveal(cachedBounds(g)); // koordinater utenfor skjermen: flytt utsnittet så resultatet vises
}

function createLine() {
  const v = readAll(lineForm, { x: 'Start X', y: 'Start Y', heading: 'Retning', length: 'Lengde' });
  if (!v) return;
  commit({
    kind: 'line',
    start: [v.x!, v.y!],
    headingRad: degToRad(v.heading!),
    lengthM: v.length!,
  });
}

function createArc() {
  const v = readAll(arcForm, {
    x: 'Start X',
    y: 'Start Y',
    heading: 'Retning',
    radius: 'Radius',
    sweep: 'Sveipvinkel',
  });
  if (!v) return;
  if (v.radius! <= 0) {
    error.value = 'Radius må være større enn 0 (velg Venstre/Høyre for kurveretning).';
    return;
  }
  commit({
    kind: 'arc',
    start: [v.x!, v.y!],
    headingRad: degToRad(v.heading!),
    signedRadiusM: (arcForm.side === 'left' ? 1 : -1) * v.radius!,
    sweepRad: degToRad(v.sweep!),
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
const connectTool = computed(() => {
  void ctrl.hint.value;
  return ctrl.tools.connect as ConnectTool;
});
const connectMode = computed(() => {
  void ctrl.hint.value;
  return connectTool.value.activeMode;
});
const scaleTool = computed(() => {
  void ctrl.hint.value;
  return ctrl.tools['bg-scale'] as BackgroundScaleTool;
});
const scaleStage = computed(() => {
  void ctrl.hint.value;
  return scaleTool.value.stage;
});
const actualDistance = ref('');
function applyScale() {
  const n = parseNumber(actualDistance.value);
  if (n === null || n <= 0) {
    error.value = 'Virkelig avstand: oppgi et positivt tall (meter).';
    return;
  }
  error.value = '';
  if (scaleTool.value.apply(n)) actualDistance.value = '';
}
const connectLength = ref('');
function applyConnectLine() {
  const n = parseNumber(connectLength.value);
  if (n === null || n <= 0) {
    error.value = 'Lengde: oppgi et positivt tall.';
    return;
  }
  error.value = '';
  if (connectTool.value.createLine(n)) connectLength.value = '';
}

function applyRotation() {
  const n = parseNumber(rotateText.value);
  if (n === null) {
    error.value = 'Vinkel: oppgi et gyldig tall (grader, mot klokka).';
    return;
  }
  if (!rotateTool.value.hasPivot) {
    error.value = 'Klikk rotasjonspunktet på tegneflaten først.';
    return;
  }
  error.value = '';
  rotateTool.value.applyDegrees(n);
}
</script>

<template>
  <form
    v-if="toolId === 'line'"
    class="tool-options"
    data-testid="options-line"
    @submit.prevent="createLine"
    @pointerdown.stop
  >
    <span class="title">Nytt rett spor</span>
    <label>Start X (m)<input v-model="lineForm.x" data-testid="new-x" inputmode="decimal" /></label>
    <label>Start Y (m)<input v-model="lineForm.y" data-testid="new-y" inputmode="decimal" /></label>
    <label
      >Retning (°)<input v-model="lineForm.heading" data-testid="new-heading" inputmode="decimal"
    /></label>
    <label
      >Lengde (m)<input v-model="lineForm.length" data-testid="new-length" inputmode="decimal"
    /></label>
    <button class="btn" type="submit" data-testid="create-line">Opprett</button>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>

  <form
    v-else-if="toolId === 'arc'"
    class="tool-options"
    data-testid="options-arc"
    @submit.prevent="createArc"
    @pointerdown.stop
  >
    <span class="title">Ny sirkelkurve</span>
    <label>Start X (m)<input v-model="arcForm.x" data-testid="new-x" inputmode="decimal" /></label>
    <label>Start Y (m)<input v-model="arcForm.y" data-testid="new-y" inputmode="decimal" /></label>
    <label
      >Retning (°)<input v-model="arcForm.heading" data-testid="new-heading" inputmode="decimal"
    /></label>
    <label
      >Radius (m)<input v-model="arcForm.radius" data-testid="new-radius" inputmode="decimal"
    /></label>
    <label
      >Kurveretning
      <select v-model="arcForm.side" data-testid="new-side">
        <option value="left">Venstre</option>
        <option value="right">Høyre</option>
      </select>
    </label>
    <label
      >Sveip (°)<input v-model="arcForm.sweep" data-testid="new-sweep" inputmode="decimal"
    /></label>
    <button class="btn" type="submit" data-testid="create-arc">Opprett</button>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>

  <form
    v-else-if="toolId === 'parallel'"
    class="tool-options"
    data-testid="options-parallel"
    @submit.prevent="setParallelDistance"
    @pointerdown.stop
  >
    <span class="title">Parallelt spor</span>
    <label
      >Sporavstand (m)<input
        v-model="parallelText"
        data-testid="parallel-distance"
        inputmode="decimal"
        @change="setParallelDistance"
    /></label>
    <label
      >Side
      <select v-model="view.parallelSide" data-testid="parallel-side">
        <option value="auto">Etter musepeker</option>
        <option value="left">Venstre</option>
        <option value="right">Høyre</option>
      </select>
    </label>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>

  <form
    v-else-if="toolId === 'rotate'"
    class="tool-options"
    data-testid="options-rotate"
    @submit.prevent="applyRotation"
    @pointerdown.stop
  >
    <span class="title">Roter</span>
    <label
      >Vinkel (°, mot klokka)<input
        v-model="rotateText"
        data-testid="rotate-angle"
        inputmode="decimal"
    /></label>
    <button class="btn" type="submit" data-testid="rotate-apply" :disabled="!rotateTool.hasPivot">
      Roter
    </button>
    <span class="muted">Klikk rotasjonspunkt først.</span>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>

  <form
    v-else-if="toolId === 'connect' && connectMode === 'line'"
    class="tool-options"
    data-testid="options-connect"
    @submit.prevent="applyConnectLine"
    @pointerdown.stop
  >
    <span class="title">Rett spor fra port</span>
    <label
      >Lengde (m)<input v-model="connectLength" data-testid="connect-length" inputmode="decimal"
    /></label>
    <button class="btn" type="submit" data-testid="connect-create">Opprett</button>
    <span class="muted">Retningen følger tangenten i endepunktet.</span>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>

  <form
    v-else-if="toolId === 'turnout'"
    class="tool-options"
    data-testid="options-turnout"
    @submit.prevent="createTurnoutNumeric"
    @pointerdown.stop
  >
    <span class="title">Sporveksel</span>
    <label
      >Type
      <select v-model="view.turnoutTypeId" data-testid="turnout-type" style="width: 190px">
        <option v-for="t in TURNOUT_CATALOG" :key="t.catalogId" :value="t.catalogId">
          {{ t.name }}
        </option>
      </select>
    </label>
    <label
      >Retning
      <select v-model="view.turnoutHand" data-testid="turnout-hand">
        <option value="left">Venstre</option>
        <option value="right">Høyre</option>
      </select>
    </label>
    <label
      >X (m)<input v-model="turnoutForm.x" data-testid="turnout-x" inputmode="decimal"
    /></label>
    <label
      >Y (m)<input v-model="turnoutForm.y" data-testid="turnout-y" inputmode="decimal"
    /></label>
    <label
      >Retning (°)<input
        v-model="turnoutForm.heading"
        data-testid="turnout-heading"
        inputmode="decimal"
    /></label>
    <button class="btn" type="submit" data-testid="create-turnout">Opprett</button>
    <div
      v-if="turnoutType"
      class="muted"
      style="flex-basis: 100%; font-size: 12px"
      data-testid="turnout-note"
    >
      {{ turnoutType.source.drawing }} · {{ TURNOUT_CATALOG_REVISION }} ·
      <b style="color: var(--warn)">delvis verifisert</b> – akser avledet fra TRV-hovedmål.
    </div>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>

  <form
    v-else-if="toolId === 'bg-scale' && scaleStage === 2"
    class="tool-options"
    data-testid="options-bg-scale"
    @submit.prevent="applyScale"
    @pointerdown.stop
  >
    <span class="title">Skaler bakgrunn</span>
    <span data-testid="bg-measured">Målt på kartet: {{ fmt(scaleTool.measuredM, 3) }} m</span>
    <label
      >Virkelig avstand (m)<input
        v-model="actualDistance"
        data-testid="bg-actual"
        inputmode="decimal"
    /></label>
    <button class="btn" type="submit" data-testid="bg-apply-scale">Bruk</button>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>

  <form
    v-else-if="toolId === 'crossing'"
    class="tool-options"
    data-testid="options-crossing"
    @submit.prevent="createCrossingNumeric"
    @pointerdown.stop
  >
    <span class="title">Sporkryss</span>
    <label
      >Forhold 1:n<input
        v-model="crossingForm.ratio"
        data-testid="crossing-ratio"
        inputmode="decimal"
        @change="syncCrossingParams"
    /></label>
    <label
      >Lengde M→ende (m)<input
        v-model="crossingForm.half"
        data-testid="crossing-half"
        inputmode="decimal"
        @change="syncCrossingParams"
    /></label>
    <label
      >M X (m)<input v-model="crossingForm.x" data-testid="crossing-x" inputmode="decimal"
    /></label>
    <label
      >M Y (m)<input v-model="crossingForm.y" data-testid="crossing-y" inputmode="decimal"
    /></label>
    <label
      >Retning A (°)<input
        v-model="crossingForm.heading"
        data-testid="crossing-heading"
        inputmode="decimal"
    /></label>
    <button class="btn" type="submit" data-testid="create-crossing">Opprett</button>
    <div class="muted" style="flex-basis: 100%; font-size: 12px" data-testid="crossing-note">
      <b style="color: var(--warn)">Brukerdefinert – ikke verifisert.</b> Åpne norske produktmål
      finnes ikke; hent lengden fra leverandørtegning. Spor B ligger atan(1/n) mot klokka fra spor
      A.
    </div>
    <div v-if="error" class="err" role="alert">{{ error }}</div>
  </form>
</template>
