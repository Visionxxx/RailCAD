<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  branchTangentM,
  deriveFromDimensions,
  definitionFromCustom,
  isTurnout,
  nextId,
  turnoutKindLabel,
  turnoutPortsFor,
  validateCustomTurnout,
  type CrossingPreset,
  type CustomTurnoutType,
  type TurnoutBranch,
} from '@railcad/domain';
import { useActions } from '../actions';
import { geometryEngine as engine } from '../engine';
import { fmt, parseNumber, portLabel } from '../format';
import { trackPath } from '../rendering/paths';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import { useViewStore } from '../stores/view';

const project = useProjectStore();
const ui = useUiStore();
const view = useViewStore();
const actions = useActions();

type Tab = 'turnouts' | 'crossings';
const tab = ref<Tab>('turnouts');

// ---------- Veksler ----------

interface BranchForm {
  hand: 'left' | 'right';
  ratio: string;
  radius: string;
  straight: string;
}
interface Draft {
  id: string | null; // null = ny
  name: string;
  source: string;
  note: string;
  mode: 'geometry' | 'dimensions';
  hasStem: boolean;
  stem: string;
  branches: BranchForm[];
  dims: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'L', string>;
}

const emptyDims = () => ({ A: '', B: '', C: '', D: '', E: '', F: '', L: '' });
const newDraft = (): Draft => ({
  id: null,
  name: '',
  source: '',
  note: '',
  mode: 'geometry',
  hasStem: true,
  stem: '30',
  branches: [{ hand: 'left', ratio: '9', radius: '300', straight: '0' }],
  dims: emptyDims(),
});
const draft = reactive<Draft>(newDraft());
const message = ref('');

const text = (n: number | undefined) => (n === undefined ? '' : fmt(n, 4));

function load(c: CustomTurnoutType | null) {
  message.value = '';
  if (!c) return Object.assign(draft, newDraft());
  const m = c.mainDimensionsMm;
  Object.assign(draft, {
    id: c.id,
    name: c.name,
    source: c.source ?? '',
    note: c.note ?? '',
    mode: c.inputMode,
    hasStem: c.stemLengthM !== null,
    stem: text(c.stemLengthM ?? 30),
    branches: c.branches.map((b) => ({
      hand: b.hand,
      ratio: text(b.ratioN),
      radius: text(b.radiusM),
      straight: text(b.straightM),
    })),
    dims: {
      A: text(m?.A),
      B: text(m?.B),
      C: text(m?.C),
      D: text(m?.D),
      E: text(m?.E),
      F: text(m?.F),
      L: text(m?.L),
    },
  } satisfies Partial<Draft>);
}

watch(
  () => ui.turnoutEditorOpen,
  (open) => {
    if (open) {
      tab.value = 'turnouts';
      const sel = project.customTurnouts.find((c) => c.id === view.turnoutTypeId);
      load(sel ?? null);
      loadPreset(null);
    }
  },
  { immediate: true },
);

const num = (s: string) => (s.trim() ? parseNumber(s) : null);
const dimNums = computed(() => {
  const out: Partial<Record<keyof Draft['dims'], number>> = {};
  for (const [k, v] of Object.entries(draft.dims)) {
    const n = num(v);
    if (n !== null) out[k as keyof Draft['dims']] = n;
  }
  return out;
});

/** Utledning fra hovedmål (modus «hovedmål»): én gren + stamspor, som i TRV-tabellene. */
const derived = computed(() => {
  if (draft.mode !== 'dimensions') return null;
  const ratio = num(draft.branches[0]?.ratio ?? '');
  if (ratio === null) return null;
  const d = dimNums.value;
  return deriveFromDimensions({ ratioN: ratio, A: d.A, B: d.B, C: d.C, D: d.D, L: d.L });
});

/** Bygger typen fra skjemaet, eller returnerer feil. Tomme/ugyldige tall gir feilmelding. */
const built = computed<{ type: CustomTurnoutType | null; errors: string[] }>(() => {
  const errors: string[] = [];
  const read = (s: string, label: string): number => {
    const n = num(s);
    if (n === null) {
      errors.push(`${label}: oppgi et tall.`);
      return NaN;
    }
    return n;
  };
  const dimMode = draft.mode === 'dimensions';
  let stemLengthM: number | null = null;
  const branches: TurnoutBranch[] = [];
  if (dimMode) {
    const b = draft.branches[0];
    if (!b) return { type: null, errors: ['Mangler gren.'] };
    const ratioN = read(b.ratio, 'Forhold 1:n');
    if (derived.value?.radiusM === undefined) errors.push('Oppgi A eller C for å utlede radius.');
    if (derived.value?.stemLengthM === undefined) errors.push('Oppgi L (total lengde).');
    stemLengthM = derived.value?.stemLengthM ?? null;
    branches.push({
      hand: b.hand,
      ratioN,
      radiusM: derived.value?.radiusM ?? NaN,
      straightM: derived.value?.straightM ?? 0,
    });
  } else {
    if (draft.hasStem) stemLengthM = read(draft.stem, 'Stamsporlengde');
    draft.branches.forEach((b, i) =>
      branches.push({
        hand: b.hand,
        ratioN: read(b.ratio, `Gren ${i + 1}: forhold 1:n`),
        radiusM: read(b.radius, `Gren ${i + 1}: radius`),
        straightM: read(b.straight || '0', `Gren ${i + 1}: rett parti`),
      }),
    );
  }
  if (errors.length) return { type: null, errors };
  const dims = dimNums.value;
  const type: CustomTurnoutType = {
    id: draft.id ?? 'ny',
    name: draft.name.trim(),
    stemLengthM,
    branches,
    inputMode: draft.mode,
    ...(dimMode && Object.keys(dims).length ? { mainDimensionsMm: dims } : {}),
    ...(draft.source.trim() ? { source: draft.source.trim() } : {}),
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
  };
  return { type, errors: validateCustomTurnout(type) };
});

const def = computed(() => (built.value.type ? definitionFromCustom(built.value.type) : null));
const kind = computed(() => (def.value ? turnoutKindLabel(def.value) : ''));
const tangents = computed(() =>
  (built.value.type?.branches ?? []).map((b) => branchTangentM(b)).filter(Number.isFinite),
);

// ---------- Forhåndsvisning ----------

const preview = computed(() => {
  const d = def.value;
  if (!d || built.value.errors.some((e) => !/^ID /.test(e))) return null;
  const layout = engine.turnoutLayout(d, {
    catalogId: d.id,
    catalogRevision: '',
    position: [0, 0],
    headingRad: 0,
    hand: 'left',
  });
  let minX = 0,
    maxX = 0,
    minY = 0,
    maxY = 0;
  for (const p of Object.values(layout.ports)) {
    minX = Math.min(minX, p.point[0]);
    maxX = Math.max(maxX, p.point[0]);
    minY = Math.min(minY, p.point[1]);
    maxY = Math.max(maxY, p.point[1]);
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, w * 0.18);
  const pad = Math.max(w, h) * 0.12;
  // SVG har y nedover: speil y slik at «venstre» vises opp.
  const vb = {
    x: minX - pad,
    y: -(maxY + pad + h * 0.1),
    w: w + 2 * pad,
    h: h + 2 * pad + h * 0.2,
  };
  const ports = Object.entries(layout.ports).map(([name, p]) => ({
    name,
    label: portLabel(name),
    x: p.point[0],
    y: -p.point[1],
  }));
  return {
    paths: layout.segments.map((s) => trackPath(s)),
    ports,
    vb,
    unit: Math.max(vb.w, vb.h) / 300,
  };
});

// ---------- Lagring ----------

const usedBy = (id: string) =>
  project.objects.filter((o) => isTurnout(o) && o.turnout.catalogId === id);

function save() {
  message.value = '';
  const b = built.value;
  if (!b.type) return void (message.value = b.errors[0] ?? 'Skjemaet er ugyldig.');
  if (!b.type.name) return void (message.value = 'Navn kan ikke være tomt.');
  const list = project.customTurnouts;
  const id =
    draft.id ??
    nextId(
      'egen',
      list.map((c) => c.id),
    );
  const type = { ...b.type, id };
  const errors = validateCustomTurnout(type);
  if (errors.length) return void (message.value = errors[0]);
  // En port som er koblet kan ikke forsvinne fra typen.
  if (draft.id) {
    const ports = new Set<string>(turnoutPortsFor(definitionFromCustom(type)));
    const ids = new Set(usedBy(id).map((o) => o.id));
    const lost = project.connections
      .flatMap((c) => [c.a, c.b])
      .filter((e) => ids.has(e.objectId) && !ports.has(e.port));
    if (lost.length)
      return void (message.value = `Typen brukes av objekter med koblinger til porter som ikke lenger finnes (${lost
        .map((e) => `${e.objectId} ${portLabel(e.port)}`)
        .join(', ')}). Fjern koblingene først.`);
  }
  const next = draft.id ? list.map((c) => (c.id === id ? type : c)) : [...list, type];
  project.setCustomTurnouts(next, draft.id ? 'Endre veksltype' : 'Ny veksltype');
  draft.id = id;
  ui.notify(`Lagret «${type.name}» (brukerdefinert – ikke verifisert).`);
}

function remove(c: CustomTurnoutType) {
  const n = usedBy(c.id).length;
  if (n) {
    message.value = `«${c.name}» brukes av ${n} objekt${n > 1 ? 'er' : ''} og kan ikke slettes.`;
    return;
  }
  project.setCustomTurnouts(
    project.customTurnouts.filter((x) => x.id !== c.id),
    'Slett veksltype',
  );
  if (draft.id === c.id) load(null);
}

function duplicate(c: CustomTurnoutType) {
  const id = nextId(
    'egen',
    project.customTurnouts.map((x) => x.id),
  );
  project.setCustomTurnouts(
    [...project.customTurnouts, { ...c, id, name: `${c.name} (kopi)` }],
    'Dupliser veksltype',
  );
  load(project.customTurnouts.find((x) => x.id === id) ?? null);
}

function useInTool(c: CustomTurnoutType) {
  view.turnoutTypeId = c.id;
  ui.turnoutEditorOpen = false;
  ui.notify(`«${c.name}» er valgt i veksel-verktøyet (T).`);
}

function addBranch() {
  if (draft.branches.length >= 2) return;
  const first = draft.branches[0];
  draft.branches.push({
    hand: first?.hand === 'left' ? 'right' : 'left',
    ratio: first?.ratio ?? '9',
    radius: first?.radius ?? '300',
    straight: first?.straight ?? '0',
  });
}
function removeBranch(i: number) {
  if (draft.branches.length > 1) draft.branches.splice(i, 1);
}
function setMode(m: Draft['mode']) {
  draft.mode = m;
  if (m === 'dimensions') {
    draft.hasStem = true;
    draft.branches.splice(1);
  }
}

// ---------- Sporkryss / kryssveksel ----------

interface PresetForm {
  id: string | null;
  name: string;
  ratio: string;
  half: string;
  slip: boolean;
  arcs: 'ab' | 'ba' | 'both';
  radius: string;
  note: string;
}
const presetForm = reactive<PresetForm>({
  id: null,
  name: '',
  ratio: '9',
  half: '17',
  slip: false,
  arcs: 'both',
  radius: '200',
  note: '',
});
const presetMessage = ref('');
function loadPreset(p: CrossingPreset | null) {
  presetMessage.value = '';
  Object.assign(presetForm, {
    id: p?.id ?? null,
    name: p?.name ?? '',
    ratio: text(p?.ratioN ?? 9),
    half: text(p?.halfLengthM ?? 17),
    slip: !!p?.slip,
    arcs: p?.slip?.arcs ?? 'both',
    radius: text(p?.slip?.radiusM ?? 200),
    note: p?.note ?? '',
  } satisfies PresetForm);
}
function savePreset() {
  presetMessage.value = '';
  const f = presetForm;
  const ratioN = num(f.ratio);
  const halfLengthM = num(f.half);
  const radiusM = num(f.radius);
  if (!f.name.trim()) return void (presetMessage.value = 'Navn kan ikke være tomt.');
  if (ratioN === null || ratioN < 1.5 || ratioN > 100)
    return void (presetMessage.value = 'Forholdet 1:n må ha n mellom 1,5 og 100.');
  if (halfLengthM === null || halfLengthM <= 0 || halfLengthM > 1e4)
    return void (presetMessage.value = 'Lengden fra M til enden må være mellom 0 og 10 000 m.');
  if (f.slip && (radiusM === null || radiusM <= 0 || radiusM > 1e5))
    return void (presetMessage.value = 'Radius må være mellom 0 og 100 000 m.');
  if (f.slip && radiusM! * Math.tan(Math.atan(1 / ratioN) / 2) > halfLengthM)
    return void (presetMessage.value =
      'Tangentlengden R·tan(α/2) overstiger lengden fra M til enden. Øk lengden eller reduser radius.');
  const list = project.crossingPresets;
  const id =
    f.id ??
    nextId(
      'kryss',
      list.map((p) => p.id),
    );
  const preset: CrossingPreset = {
    id,
    name: f.name.trim(),
    ratioN,
    halfLengthM,
    ...(f.slip ? { slip: { arcs: f.arcs, radiusM: radiusM! } } : {}),
    ...(f.note.trim() ? { note: f.note.trim() } : {}),
  };
  project.setCrossingPresets(
    f.id ? list.map((p) => (p.id === id ? preset : p)) : [...list, preset],
    f.id ? 'Endre forhåndsinnstilling' : 'Ny forhåndsinnstilling',
  );
  f.id = id;
  ui.notify(`Lagret «${preset.name}» (brukerdefinert – ikke verifisert).`);
}
function removePreset(p: CrossingPreset) {
  project.setCrossingPresets(
    project.crossingPresets.filter((x) => x.id !== p.id),
    'Slett forhåndsinnstilling',
  );
  if (presetForm.id === p.id) loadPreset(null);
}
</script>

<template>
  <div v-if="ui.turnoutEditorOpen" class="backdrop" @keydown.esc="ui.turnoutEditorOpen = false">
    <div
      class="dialog editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="te-title"
      data-testid="turnout-editor"
    >
      <h2 id="te-title">Veksler og kryss</h2>
      <p class="muted warn-note" data-testid="te-warning">
        Alt du lager her er <b>brukerdefinert og ikke verifisert</b>. Geometrien er akser
        (sirkelbuer og rette linjer), ikke produktgeometri. Bruk mål fra din egen kilde, og ikke
        bruk resultatet som godkjent prosjektering.
      </p>
      <div class="tabs" role="tablist">
        <button
          role="tab"
          :aria-selected="tab === 'turnouts'"
          :class="{ on: tab === 'turnouts' }"
          data-testid="te-tab-turnouts"
          @click="tab = 'turnouts'"
        >
          Veksler
        </button>
        <button
          role="tab"
          :aria-selected="tab === 'crossings'"
          :class="{ on: tab === 'crossings' }"
          data-testid="te-tab-crossings"
          @click="tab = 'crossings'"
        >
          Sporkryss og kryssveksel
        </button>
      </div>

      <div v-if="tab === 'turnouts'" class="cols">
        <aside class="list">
          <button class="btn" data-testid="te-new" @click="load(null)">+ Ny veksel</button>
          <p v-if="!project.customTurnouts.length" class="muted" style="font-size: 12px">
            Ingen egne veksler ennå. Fyll ut skjemaet og trykk «Lagre».
          </p>
          <div
            v-for="c in project.customTurnouts"
            :key="c.id"
            class="item"
            :class="{ on: draft.id === c.id }"
            data-testid="te-item"
          >
            <button class="link" @click="load(c)">{{ c.name }}</button>
            <span class="muted">{{ c.id }}</span>
            <span class="row">
              <button class="mini" title="Dupliser" @click="duplicate(c)">⧉</button>
              <button class="mini" title="Bruk i verktøyet" @click="useInTool(c)">▶</button>
              <button class="mini" title="Slett" data-testid="te-delete" @click="remove(c)">
                ✕
              </button>
            </span>
          </div>
        </aside>

        <form class="form" data-testid="te-form" @submit.prevent="save">
          <label
            >Navn <input v-model="draft.name" type="text" data-testid="te-name" maxlength="80"
          /></label>
          <div class="seg">
            <label class="inline"
              ><input
                type="radio"
                :checked="draft.mode === 'geometry'"
                data-testid="te-mode-geometry"
                @change="setMode('geometry')"
              />
              Geometri (R, 1:n)</label
            >
            <label class="inline"
              ><input
                type="radio"
                :checked="draft.mode === 'dimensions'"
                data-testid="te-mode-dimensions"
                @change="setMode('dimensions')"
              />
              Hovedmål A–F (som TRV)</label
            >
          </div>

          <template v-if="draft.mode === 'geometry'">
            <label class="inline"
              ><input v-model="draft.hasStem" type="checkbox" data-testid="te-has-stem" /> Har
              gjennomgående stamspor</label
            >
            <label v-if="draft.hasStem"
              >Stamsporlengde fra SS (m)
              <input v-model="draft.stem" type="text" inputmode="decimal" data-testid="te-stem"
            /></label>
          </template>

          <fieldset v-for="(b, i) in draft.branches" :key="i" class="branch">
            <legend>Gren {{ i + 1 }}</legend>
            <label
              >Retning
              <select v-model="b.hand" :data-testid="`te-hand-${i}`">
                <option value="left">Venstre</option>
                <option value="right">Høyre</option>
              </select></label
            >
            <label
              >Forhold 1:n
              <input
                v-model="b.ratio"
                type="text"
                inputmode="decimal"
                :data-testid="`te-ratio-${i}`"
            /></label>
            <template v-if="draft.mode === 'geometry'">
              <label
                >Radius (m)
                <input
                  v-model="b.radius"
                  type="text"
                  inputmode="decimal"
                  :data-testid="`te-radius-${i}`"
              /></label>
              <label
                >Rett parti etter buen (m)
                <input
                  v-model="b.straight"
                  type="text"
                  inputmode="decimal"
                  :data-testid="`te-straight-${i}`"
              /></label>
            </template>
            <button
              v-if="draft.branches.length > 1"
              type="button"
              class="mini"
              @click="removeBranch(i)"
            >
              Fjern gren
            </button>
          </fieldset>
          <button
            v-if="draft.mode === 'geometry' && draft.branches.length < 2"
            type="button"
            class="btn secondary"
            data-testid="te-add-branch"
            @click="addBranch"
          >
            + Legg til gren (tresporsveksel / symmetrisk)
          </button>

          <fieldset v-if="draft.mode === 'dimensions'" class="branch">
            <legend>Hovedmål (mm)</legend>
            <div class="dims">
              <label v-for="k in ['A', 'B', 'C', 'D', 'E', 'F', 'L'] as const" :key="k"
                >{{ k }}
                <input
                  v-model="draft.dims[k]"
                  type="text"
                  inputmode="decimal"
                  :data-testid="`te-dim-${k}`"
              /></label>
            </div>
            <p class="muted" style="font-size: 11px">
              Radius utledes fra A (eller C) som R = A / tan(α/2), rett parti fra D og stamspor fra
              L. Målene kontrolleres mot hverandre (A≈C, B=C+D, L≈A+B).
            </p>
            <p v-if="derived" class="derived" data-testid="te-derived">
              Utledet: R = {{ derived.radiusM === undefined ? '–' : fmt(derived.radiusM, 3) }} m ·
              rett parti = {{ fmt(derived.straightM, 3) }} m · stamspor =
              {{ derived.stemLengthM === undefined ? '–' : fmt(derived.stemLengthM, 3) }} m
            </p>
            <p
              v-for="w in derived?.warnings ?? []"
              :key="w"
              class="warn"
              data-testid="te-dim-warning"
            >
              ⚠ {{ w }}
            </p>
          </fieldset>

          <label
            >Kilde (tegning, leverandør, dokument)
            <input v-model="draft.source" type="text" data-testid="te-source" maxlength="500"
          /></label>
          <label
            >Merknad
            <textarea v-model="draft.note" rows="2" data-testid="te-note" maxlength="2000" />
          </label>

          <p v-if="kind" class="muted" style="font-size: 12px" data-testid="te-kind">
            {{ kind }} · tangentlengde T = R·tan(α/2):
            {{ tangents.map((t) => fmt(t, 3) + ' m').join(' / ') }}
          </p>
          <p v-for="e in built.errors" :key="e" class="warn" data-testid="te-error">⚠ {{ e }}</p>
          <p v-if="message" class="warn" role="alert" data-testid="te-message">{{ message }}</p>

          <div class="actions">
            <button class="btn" type="submit" data-testid="te-save">
              {{ draft.id ? 'Lagre endringer' : 'Lagre som ny' }}
            </button>
          </div>
        </form>

        <figure class="preview">
          <svg
            v-if="preview"
            :viewBox="`${preview.vb.x} ${preview.vb.y} ${preview.vb.w} ${preview.vb.h}`"
            preserveAspectRatio="xMidYMid meet"
            data-testid="te-preview"
            role="img"
            aria-label="Forhåndsvisning av veksel"
          >
            <g transform="scale(1,-1)">
              <path
                v-for="(d, i) in preview.paths"
                :key="i"
                :d="d"
                fill="none"
                stroke="var(--accent, #4aa3ff)"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
              />
            </g>
            <g v-for="p in preview.ports" :key="p.name">
              <circle :cx="p.x" :cy="p.y" :r="preview.unit * 3" fill="var(--warn, #e0a030)" />
              <text
                :x="p.x"
                :y="p.y - preview.unit * 6"
                :font-size="preview.unit * 10"
                text-anchor="middle"
                fill="currentColor"
              >
                {{ p.label }}
              </text>
            </g>
          </svg>
          <p v-else class="muted" data-testid="te-preview-empty">
            Forhåndsvisning vises når skjemaet er gyldig.
          </p>
          <figcaption class="muted" style="font-size: 11px">
            Skjematisk akseplan, SS i origo. Venstre gren vises opp.
          </figcaption>
        </figure>
      </div>

      <div v-else class="cols two">
        <aside class="list">
          <button class="btn" data-testid="tp-new" @click="loadPreset(null)">
            + Ny forhåndsinnstilling
          </button>
          <div
            v-for="p in project.crossingPresets"
            :key="p.id"
            class="item"
            :class="{ on: presetForm.id === p.id }"
            data-testid="tp-item"
          >
            <button class="link" @click="loadPreset(p)">{{ p.name }}</button>
            <span class="muted"
              >1:{{ fmt(p.ratioN, 2) }} · {{ p.slip ? 'kryssveksel' : 'sporkryss' }}</span
            >
            <span class="row">
              <button class="mini" title="Slett" data-testid="tp-delete" @click="removePreset(p)">
                ✕
              </button>
            </span>
          </div>
        </aside>
        <form class="form" data-testid="tp-form" @submit.prevent="savePreset">
          <label
            >Navn <input v-model="presetForm.name" type="text" data-testid="tp-name" maxlength="80"
          /></label>
          <label
            >Krysningsforhold 1:n
            <input
              v-model="presetForm.ratio"
              type="text"
              inputmode="decimal"
              data-testid="tp-ratio"
          /></label>
          <label
            >Lengde M → ende (m)
            <input v-model="presetForm.half" type="text" inputmode="decimal" data-testid="tp-half"
          /></label>
          <label class="inline"
            ><input v-model="presetForm.slip" type="checkbox" data-testid="tp-slip" /> Kryssveksel
            (med sporbuer)</label
          >
          <template v-if="presetForm.slip">
            <label
              >Buer
              <select v-model="presetForm.arcs" data-testid="tp-arcs">
                <option value="both">Begge (dobbel)</option>
                <option value="ab">Enkel A→B</option>
                <option value="ba">Enkel B→A</option>
              </select></label
            >
            <label
              >Radius (m)
              <input
                v-model="presetForm.radius"
                type="text"
                inputmode="decimal"
                data-testid="tp-radius"
            /></label>
          </template>
          <label
            >Merknad
            <textarea v-model="presetForm.note" rows="2" data-testid="tp-note" maxlength="2000" />
          </label>
          <p v-if="presetMessage" class="warn" role="alert" data-testid="tp-message">
            {{ presetMessage }}
          </p>
          <div class="actions">
            <button class="btn" type="submit" data-testid="tp-save">
              {{ presetForm.id ? 'Lagre endringer' : 'Lagre som ny' }}
            </button>
          </div>
        </form>
      </div>

      <div class="actions foot">
        <button class="btn secondary" data-testid="te-import" @click="actions.importLibrary()">
          Importer bibliotek …
        </button>
        <button class="btn secondary" data-testid="te-export" @click="actions.exportLibrary()">
          Eksporter bibliotek …
        </button>
        <span style="flex: 1" />
        <button class="btn secondary" data-testid="te-close" @click="ui.turnoutEditorOpen = false">
          Lukk
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor {
  width: min(1080px, 96vw);
  max-height: 90vh;
}
.warn-note {
  font-size: 12px;
  margin: 0 0 8px;
  color: var(--warn);
}
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  padding: 6px 12px;
  background: none;
  border: 0;
  color: var(--text-dim);
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tabs button.on {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.cols {
  display: grid;
  grid-template-columns: 200px minmax(280px, 1fr) minmax(260px, 1fr);
  gap: 14px;
  align-items: start;
}
.cols.two {
  grid-template-columns: 200px minmax(280px, 1fr);
}
@media (max-width: 860px) {
  .cols,
  .cols.two {
    grid-template-columns: 1fr;
  }
}
.list {
  display: grid;
  gap: 6px;
}
.item {
  display: grid;
  gap: 2px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
}
.item.on {
  border-color: var(--accent);
}
.item .row {
  display: flex;
  gap: 4px;
}
.link {
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
}
.mini {
  padding: 1px 6px;
  font-size: 11px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text);
  cursor: pointer;
}
.form {
  display: grid;
  gap: 2px;
}
.form input[type='text'],
.form select,
.form textarea {
  width: 100%;
  padding: 5px 7px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
}
.inline {
  display: flex;
  align-items: center;
  gap: 6px;
}
.seg {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.branch {
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.dims {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.dims label {
  margin-bottom: 4px;
}
.warn {
  margin: 2px 0;
  font-size: 12px;
  color: var(--warn);
}
.derived {
  margin: 2px 0;
  font-size: 12px;
}
.preview {
  margin: 0;
  display: grid;
  gap: 4px;
}
.preview svg {
  width: 100%;
  height: 260px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.foot {
  margin-top: 12px;
  align-items: center;
}
</style>
