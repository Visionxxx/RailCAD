<script setup lang="ts">
import { computed } from 'vue';
import {
  CROSSING_PORTS,
  TRACK_PORTS,
  TURNOUT_PORTS,
  getTurnoutType,
  isCrossing,
  isDimension,
  isTrack,
  isTurnout,
  validateGeometry,
  type CrossingObject,
  type CrossingPlacement,
  type DimensionObject,
  type TrackGeometry,
  type TrackSegment,
  type TurnoutObject,
  type TurnoutPlacement,
  type Vec2,
} from '@railcad/domain';
import { TOLERANCES } from '@railcad/geometry-api';
import { geometryEngine as engine } from '../engine';
import { degToRad, fmt, fmtM, portLabel, radToDeg } from '../format';
import NumberField from './NumberField.vue';
import { useProjectStore } from '../stores/project';

const project = useProjectStore();

const selected = computed(() => project.selectedObjects);
const track = computed<TrackSegment | null>(() => {
  const o = selected.value.length === 1 ? selected.value[0] : undefined;
  return o && isTrack(o) ? o : null;
});
const dimension = computed<DimensionObject | null>(() => {
  const o = selected.value.length === 1 ? selected.value[0] : undefined;
  return o && isDimension(o) ? o : null;
});

const geom = computed(() => track.value?.geometry ?? null);
const arc = computed(() => (geom.value?.kind === 'arc' ? geom.value : null));
const line = computed(() => (geom.value?.kind === 'line' ? geom.value : null));
const end = computed(() => (geom.value ? engine.endPose(geom.value) : null));
const center = computed(() => (geom.value ? engine.arcCenter(geom.value) : null));
const totalLength = computed(() => (geom.value ? engine.length(geom.value) : 0));

/** Bygger en validator som sjekker hele den nye geometrien mot invariantene før noe lagres. */
function geometryValidator(make: (g: TrackGeometry, n: number) => TrackGeometry) {
  return (n: number): string | null => {
    const g = geom.value;
    if (!g) return null;
    const next = make(g, n);
    const errors = validateGeometry(next);
    if (errors.length) return errors[0] ?? null;
    if (engine.length(next) < TOLERANCES.minSegmentLengthM) return 'Sporet blir for kort.';
    return null;
  };
}

function editGeometry(label: string, make: (g: TrackGeometry, n: number) => TrackGeometry) {
  return {
    validate: geometryValidator(make),
    commit: (n: number) => {
      const t = track.value;
      if (t) project.updateObject({ ...t, geometry: make(t.geometry, n) }, label);
    },
  };
}

const withStartX = editGeometry('Endre startpunkt', (g, n) => ({ ...g, start: [n, g.start[1]] }));
const withStartY = editGeometry('Endre startpunkt', (g, n) => ({ ...g, start: [g.start[0], n] }));
const withHeading = editGeometry('Endre retning', (g, n) => ({ ...g, headingRad: degToRad(n) }));
const withLength = editGeometry('Endre lengde', (g, n) =>
  g.kind === 'line' ? { ...g, lengthM: n } : g,
);
const withRadiusBase = editGeometry('Endre radius', (g, n) =>
  g.kind === 'arc' ? { ...g, signedRadiusM: Math.sign(g.signedRadiusM) * n } : g,
);
/** Feltet viser |R|; venstre/høyre styres av «Kurveretning». Negativ verdi ville stille snudd retningen. */
const withRadius = {
  commit: withRadiusBase.commit,
  validate: (n: number) =>
    n > 0
      ? withRadiusBase.validate(n)
      : 'Radius må være større enn 0. Bruk «Kurveretning» for venstre/høyre.',
};
const withSweep = editGeometry('Endre sveipvinkel', (g, n) =>
  g.kind === 'arc' ? { ...g, sweepRad: degToRad(n) } : g,
);
const withArcLength = editGeometry('Endre buelengde', (g, n) =>
  g.kind === 'arc' ? { ...g, sweepRad: n / Math.abs(g.signedRadiusM) } : g,
);

function setCurveSide(e: Event) {
  const side = (e.target as HTMLSelectElement).value;
  const t = track.value;
  if (!t || t.geometry.kind !== 'arc') return;
  const magnitude = Math.abs(t.geometry.signedRadiusM);
  project.updateObject(
    { ...t, geometry: { ...t.geometry, signedRadiusM: side === 'left' ? magnitude : -magnitude } },
    'Endre kurveretning',
  );
}

// --- Prosjektoversikt (når ingenting er valgt) ---
const overview = computed(() => {
  let trackCount = 0;
  let totalLengthM = 0;
  let turnouts = 0;
  let crossings = 0;
  let dims = 0;
  for (const o of project.objects) {
    if (isTrack(o)) {
      trackCount++;
      totalLengthM += engine.length(o.geometry);
    } else if (isTurnout(o)) turnouts++;
    else if (isCrossing(o)) crossings++;
    else dims++;
  }
  const issues = project.connectionResults.filter((r) => r.status !== 'ok').length;
  return { trackCount, totalLengthM, turnouts, crossings, dims, issues };
});

// --- Sporveksel ---
const turnout = computed<TurnoutObject | null>(() => {
  const o = selected.value.length === 1 ? selected.value[0] : undefined;
  return o && isTurnout(o) ? o : null;
});
const turnoutType = computed(() =>
  turnout.value ? getTurnoutType(turnout.value.turnout.catalogId) : undefined,
);
const turnoutDims = computed(() => {
  const m = turnoutType.value?.mainDimensionsMm;
  if (!m) return '';
  return (['A', 'B', 'C', 'D', 'L', 'E', 'F'] as const)
    .map((k) => `${k} ${m[k] ?? '–'}`)
    .join(' · ');
});
function editTurnout(label: string, make: (p: TurnoutPlacement, n: number) => TurnoutPlacement) {
  return {
    commit: (n: number) => {
      const o = turnout.value;
      if (o) project.updateObject({ ...o, turnout: make(o.turnout, n) }, label);
    },
  };
}
const tX = editTurnout('Flytt sporveksel', (p, n) => ({ ...p, position: [n, p.position[1]] }));
const tY = editTurnout('Flytt sporveksel', (p, n) => ({ ...p, position: [p.position[0], n] }));
const tHeading = editTurnout('Roter sporveksel', (p, n) => ({ ...p, headingRad: degToRad(n) }));
function setTurnoutHand(e: Event) {
  const o = turnout.value;
  if (!o) return;
  const hand = (e.target as HTMLSelectElement).value === 'right' ? 'right' : 'left';
  project.updateObject({ ...o, turnout: { ...o.turnout, hand } }, 'Endre vekselretning');
}

// --- Sporkryss ---
const crossing = computed<CrossingObject | null>(() => {
  const o = selected.value.length === 1 ? selected.value[0] : undefined;
  return o && isCrossing(o) ? o : null;
});
function editCrossing(
  label: string,
  make: (p: CrossingPlacement, n: number) => CrossingPlacement,
  validate?: (n: number) => string | null,
) {
  return {
    validate,
    commit: (n: number) => {
      const o = crossing.value;
      if (o) project.updateObject({ ...o, crossing: make(o.crossing, n) }, label);
    },
  };
}
const cX = editCrossing('Flytt sporkryss', (p, n) => ({ ...p, position: [n, p.position[1]] }));
const cY = editCrossing('Flytt sporkryss', (p, n) => ({ ...p, position: [p.position[0], n] }));
const cHeading = editCrossing('Roter sporkryss', (p, n) => ({ ...p, headingRad: degToRad(n) }));
const cRatio = editCrossing(
  'Endre krysningsforhold',
  (p, n) => ({ ...p, ratioN: n }),
  (n) => (n >= 1.5 && n <= 100 ? null : 'Forholdet 1:n må ha n mellom 1,5 og 100.'),
);
const cHalf = editCrossing(
  'Endre sporkryss-lengde',
  (p, n) => ({ ...p, halfLengthM: n }),
  (n) => (n > 0 && n <= 1e4 ? null : 'Lengden må være mellom 0 og 10 000 m.'),
);
const crossingAngleDeg = computed(() =>
  crossing.value ? radToDeg(Math.atan(1 / crossing.value.crossing.ratioN)) : 0,
);

// --- Koblinger ---
const portInfo = computed(() => {
  const o = track.value ?? turnout.value ?? crossing.value;
  if (!o) return [];
  const ports = track.value ? TRACK_PORTS : crossing.value ? CROSSING_PORTS : TURNOUT_PORTS;
  return ports.map((port) => {
    const r = project.connectionResults.find(
      (x) =>
        (x.connection.a.objectId === o.id && x.connection.a.port === port) ||
        (x.connection.b.objectId === o.id && x.connection.b.port === port),
    );
    if (!r) return { port, text: 'ledig', cls: 'muted' };
    const other =
      r.connection.a.objectId === o.id && r.connection.a.port === port
        ? r.connection.b
        : r.connection.a;
    return {
      port,
      text: `${other.objectId} ${portLabel(other.port)} · ${r.status === 'ok' ? 'OK' : 'avvik'}`,
      cls: r.status === 'ok' ? '' : 'st position',
    };
  });
});

// --- Mål ---
const dimLayout = computed(() => {
  const d = dimension.value;
  if (!d) return null;
  return engine.dimensionLayout(d.dimension, (id) => {
    const t = project.byId.get(id);
    return t && isTrack(t) ? t.geometry : undefined;
  });
});

function editDimension(
  label: string,
  make: (d: DimensionObject['dimension'], n: number) => DimensionObject['dimension'],
) {
  const check = (n: number): string | null => {
    const d = dimension.value;
    if (!d) return null;
    const next = make(d.dimension, n);
    if (next.kind === 'distance' && next.a[0] === next.b[0] && next.a[1] === next.b[1]) {
      return 'Punktene kan ikke være sammenfallende.';
    }
    const layout = engine.dimensionLayout(next, (id) => {
      const t = project.byId.get(id);
      return t && isTrack(t) ? t.geometry : undefined;
    });
    return layout ? null : 'Målelinjen kan ikke plasseres slik.';
  };
  return {
    validate: check,
    commit: (n: number) => {
      const d = dimension.value;
      if (d) project.updateObject({ ...d, dimension: make(d.dimension, n) }, label);
    },
  };
}

const dimOffset = editDimension('Endre målforskyvning', (d, n) => ({ ...d, offsetM: n }));
const dimPoint = (which: 'a' | 'b', axis: 0 | 1) =>
  editDimension('Endre målpunkt', (d, n) => {
    if (d.kind !== 'distance') return d;
    const p: Vec2 = which === 'a' ? d.a : d.b;
    const moved: Vec2 = axis === 0 ? [n, p[1]] : [p[0], n];
    return which === 'a' ? { ...d, a: moved } : { ...d, b: moved };
  });
const dimAx = dimPoint('a', 0);
const dimAy = dimPoint('a', 1);
const dimBx = dimPoint('b', 0);
const dimBy = dimPoint('b', 1);
</script>

<template>
  <section class="props" aria-labelledby="prop-h" data-testid="properties">
    <h2 id="prop-h">Egenskaper</h2>

    <template v-if="!selected.length">
      <p class="muted">
        Ingen objekt valgt. Klikk et objekt, eller dra en valgboks på tegneflaten.
      </p>
      <h3 class="overview-h">Prosjektoversikt</h3>
      <div class="field ro">
        <label>Spor</label
        ><output data-testid="ov-tracks"
          >{{ overview.trackCount }} ({{ fmtM(overview.totalLengthM, 1) }})</output
        >
      </div>
      <div class="field ro">
        <label>Sporveksler</label><output data-testid="ov-turnouts">{{ overview.turnouts }}</output>
      </div>
      <div class="field ro">
        <label>Sporkryss</label
        ><output data-testid="ov-crossing-objects">{{ overview.crossings }}</output>
      </div>
      <div class="field ro">
        <label>Mål</label><output>{{ overview.dims }}</output>
      </div>
      <div class="field ro">
        <label>Koblinger</label
        ><output data-testid="ov-connections"
          >{{ project.connections.length
          }}<span v-if="overview.issues" class="st position">
            · {{ overview.issues }} avvik</span
          ></output
        >
      </div>
      <div class="field ro">
        <label>Kryssende spor</label
        ><output data-testid="ov-crossings"
          >{{ project.openCrossingCount
          }}<span v-if="project.openCrossingCount" class="st position">
            · ikke vurdert</span
          ></output
        >
      </div>
      <div class="field ro">
        <label>Bakgrunner</label><output>{{ project.backgrounds.length }}</output>
      </div>
    </template>

    <template v-else-if="selected.length > 1">
      <p data-testid="multi-count">{{ selected.length }} objekter valgt.</p>
      <div class="row-actions">
        <button
          class="btn secondary"
          data-testid="delete-selected"
          @click="project.deleteSelection()"
        >
          Slett valgte
        </button>
      </div>
    </template>

    <template v-else-if="track && geom">
      <div class="field ro">
        <label>Objekt-ID</label><output data-testid="prop-id">{{ track.id }}</output>
      </div>
      <div class="field ro">
        <label>Type</label><output>{{ geom.kind === 'line' ? 'Rett spor' : 'Sirkelkurve' }}</output>
      </div>

      <NumberField
        id="prop-start-x"
        label="Start X"
        unit="m"
        :model-value="geom.start[0]"
        :validate="withStartX.validate"
        @commit="withStartX.commit"
      />
      <NumberField
        id="prop-start-y"
        label="Start Y"
        unit="m"
        :model-value="geom.start[1]"
        :validate="withStartY.validate"
        @commit="withStartY.commit"
      />
      <NumberField
        id="prop-heading"
        label="Retning"
        unit="°"
        :decimals="4"
        :model-value="radToDeg(geom.headingRad)"
        :validate="withHeading.validate"
        @commit="withHeading.commit"
      />

      <NumberField
        v-if="line"
        id="prop-length"
        label="Lengde"
        unit="m"
        :model-value="line.lengthM"
        :validate="withLength.validate"
        @commit="withLength.commit"
      />

      <template v-if="arc">
        <NumberField
          id="prop-radius"
          label="Radius"
          unit="m"
          :model-value="Math.abs(arc.signedRadiusM)"
          :validate="withRadius.validate"
          @commit="withRadius.commit"
        />
        <div class="field">
          <label for="prop-side">Kurveretning</label>
          <select
            id="prop-side"
            data-testid="prop-side"
            :value="arc.signedRadiusM > 0 ? 'left' : 'right'"
            @change="setCurveSide"
          >
            <option value="left">Venstre</option>
            <option value="right">Høyre</option>
          </select>
        </div>
        <NumberField
          id="prop-sweep"
          label="Sveipvinkel"
          unit="°"
          :decimals="4"
          :model-value="radToDeg(arc.sweepRad)"
          :validate="withSweep.validate"
          @commit="withSweep.commit"
        />
        <NumberField
          id="prop-arclength"
          label="Buelengde"
          unit="m"
          :model-value="totalLength"
          :validate="withArcLength.validate"
          @commit="withArcLength.commit"
        />
      </template>

      <div v-if="end" class="field ro">
        <label>Slutt X / Y</label
        ><output data-testid="prop-end">{{ fmt(end.point[0]) }} / {{ fmt(end.point[1]) }}</output>
      </div>
      <div v-if="end" class="field ro">
        <label>Slutt retning</label><output>{{ fmt(radToDeg(end.headingRad), 4) }}°</output>
      </div>
      <div v-if="center" class="field ro">
        <label>Senter X / Y</label><output>{{ fmt(center[0]) }} / {{ fmt(center[1]) }}</output>
      </div>
      <div v-for="p in portInfo" :key="p.port" class="field ro">
        <label>Kobling {{ portLabel(p.port) }}</label>
        <output :data-testid="`prop-port-${p.port}`" :class="p.cls">{{ p.text }}</output>
      </div>
      <div class="field ro">
        <label>Status</label><output><span class="badge ok">Gyldig geometri</span></output>
      </div>
      <div class="field ro">
        <label>Regelverk</label><output><span class="badge">ikke vurdert</span></output>
      </div>
      <div class="row-actions">
        <button
          class="btn secondary"
          data-testid="delete-selected"
          @click="project.deleteSelection()"
        >
          Slett
        </button>
      </div>
    </template>

    <template v-else-if="crossing">
      <div class="field ro">
        <label>Objekt-ID</label><output data-testid="prop-id">{{ crossing.id }}</output>
      </div>
      <div class="field ro">
        <label>Type</label
        ><output data-testid="prop-crossing-type">Sporkryss (diamantkryss)</output>
      </div>
      <div class="field ro">
        <label>Verifisering</label
        ><output
          ><span class="badge" style="color: var(--warn)" data-testid="prop-verification"
            >Ikke verifisert</span
          ></output
        >
      </div>
      <p class="muted" style="font-size: 11px; margin: 0 0 8px">
        Brukerdefinert geometri: to rette akser som krysser i M med vinkel atan(1/n). Lengden er
        ikke et produktmål. Ikke for godkjent prosjektering.
      </p>
      <NumberField
        id="prop-start-x"
        label="M X"
        unit="m"
        :model-value="crossing.crossing.position[0]"
        @commit="cX.commit"
      />
      <NumberField
        id="prop-start-y"
        label="M Y"
        unit="m"
        :model-value="crossing.crossing.position[1]"
        @commit="cY.commit"
      />
      <NumberField
        id="prop-heading"
        label="Retning A"
        unit="°"
        :decimals="4"
        :model-value="radToDeg(crossing.crossing.headingRad)"
        @commit="cHeading.commit"
      />
      <NumberField
        id="prop-ratio"
        label="Forhold 1:n, n"
        :decimals="2"
        :model-value="crossing.crossing.ratioN"
        :validate="cRatio.validate"
        @commit="cRatio.commit"
      />
      <NumberField
        id="prop-half"
        label="Lengde M→ende"
        unit="m"
        :model-value="crossing.crossing.halfLengthM"
        :validate="cHalf.validate"
        @commit="cHalf.commit"
      />
      <div class="field ro">
        <label>Krysningsvinkel</label
        ><output data-testid="prop-angle">{{ fmt(crossingAngleDeg, 3) }}°</output>
      </div>
      <div v-for="p in portInfo" :key="p.port" class="field ro">
        <label>Kobling {{ portLabel(p.port) }}</label>
        <output :data-testid="`prop-port-${p.port}`" :class="p.cls">{{ p.text }}</output>
      </div>
      <div class="row-actions">
        <button
          class="btn secondary"
          data-testid="delete-selected"
          @click="project.deleteSelection()"
        >
          Slett
        </button>
      </div>
    </template>

    <template v-else-if="turnout && turnoutType">
      <div class="field ro">
        <label>Objekt-ID</label><output data-testid="prop-id">{{ turnout.id }}</output>
      </div>
      <div class="field ro">
        <label>Type</label><output data-testid="prop-turnout-type">{{ turnoutType.name }}</output>
      </div>
      <div class="field ro">
        <label>Kilde</label>
        <output>{{ turnoutType.source.drawing }}</output>
      </div>
      <div class="field ro">
        <label>Hovedmål (mm)</label><output style="font-size: 11px">{{ turnoutDims }}</output>
      </div>
      <div class="field ro">
        <label>Verifisering</label
        ><output
          ><span class="badge" style="color: var(--warn)" data-testid="prop-verification"
            >Delvis verifisert</span
          ></output
        >
      </div>
      <p class="muted" style="font-size: 11px; margin: 0 0 8px">
        {{ turnoutType.verificationNote }} ({{ turnout.turnout.catalogRevision }})
      </p>
      <div class="field">
        <label for="prop-hand">Avviksretning</label>
        <select
          id="prop-hand"
          data-testid="prop-hand"
          :value="turnout.turnout.hand"
          @change="setTurnoutHand"
        >
          <option value="left">Venstre</option>
          <option value="right">Høyre</option>
        </select>
      </div>
      <NumberField
        id="prop-start-x"
        label="SS X"
        unit="m"
        :model-value="turnout.turnout.position[0]"
        @commit="tX.commit"
      />
      <NumberField
        id="prop-start-y"
        label="SS Y"
        unit="m"
        :model-value="turnout.turnout.position[1]"
        @commit="tY.commit"
      />
      <NumberField
        id="prop-heading"
        label="Retning"
        unit="°"
        :decimals="4"
        :model-value="radToDeg(turnout.turnout.headingRad)"
        @commit="tHeading.commit"
      />
      <div v-for="p in portInfo" :key="p.port" class="field ro">
        <label>Kobling {{ portLabel(p.port) }}</label>
        <output :data-testid="`prop-port-${p.port}`" :class="p.cls">{{ p.text }}</output>
      </div>
      <div class="row-actions">
        <button
          class="btn secondary"
          data-testid="delete-selected"
          @click="project.deleteSelection()"
        >
          Slett
        </button>
      </div>
    </template>

    <template v-else-if="dimension">
      <div class="field ro">
        <label>Objekt-ID</label><output data-testid="prop-id">{{ dimension.id }}</output>
      </div>
      <div class="field ro">
        <label>Type</label>
        <output>{{
          dimension.dimension.kind === 'length'
            ? `Lengdemål (${dimension.dimension.targetId})`
            : 'Avstandsmål'
        }}</output>
      </div>
      <div class="field ro">
        <label>Måltall</label
        ><output data-testid="prop-dim-value">{{
          dimLayout ? fmtM(dimLayout.valueM) : '–'
        }}</output>
      </div>
      <template v-if="dimension.dimension.kind === 'distance'">
        <NumberField
          id="prop-ax"
          label="A X"
          unit="m"
          :model-value="dimension.dimension.a[0]"
          :validate="dimAx.validate"
          @commit="dimAx.commit"
        />
        <NumberField
          id="prop-ay"
          label="A Y"
          unit="m"
          :model-value="dimension.dimension.a[1]"
          :validate="dimAy.validate"
          @commit="dimAy.commit"
        />
        <NumberField
          id="prop-bx"
          label="B X"
          unit="m"
          :model-value="dimension.dimension.b[0]"
          :validate="dimBx.validate"
          @commit="dimBx.commit"
        />
        <NumberField
          id="prop-by"
          label="B Y"
          unit="m"
          :model-value="dimension.dimension.b[1]"
          :validate="dimBy.validate"
          @commit="dimBy.commit"
        />
      </template>
      <NumberField
        id="prop-dim-offset"
        label="Forskyvning"
        unit="m"
        :model-value="dimension.dimension.offsetM"
        :validate="dimOffset.validate"
        @commit="dimOffset.commit"
      />
      <div class="row-actions">
        <button
          class="btn secondary"
          data-testid="delete-selected"
          @click="project.deleteSelection()"
        >
          Slett
        </button>
      </div>
    </template>
  </section>
</template>
