<script setup lang="ts">
import { computed } from 'vue';
import { TOLERANCES, type ConnectionResult, type PortRef } from '@railcad/geometry-api';
import { fmt, fmtDeg, fmtM, portLabel, radToDeg } from '../format';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import { useViewStore } from '../stores/view';

const project = useProjectStore();
const ui = useUiStore();

const portName = (p: PortRef) => `${p.objectId} ${portLabel(p.port)}`;

function statusText(r: ConnectionResult): string {
  switch (r.status) {
    case 'ok':
      return 'OK';
    case 'position':
      return `Posisjonsavvik ${fmtM(r.distanceM)}`;
    case 'tangent':
      return `Tangentavvik ${fmtDeg(r.tangentDeviationRad)}`;
    default:
      return 'Sporobjekt mangler';
  }
}

const errorCount = computed(
  () => project.connectionResults.filter((r) => r.status !== 'ok').length,
);
const tangentTolDeg = computed(() => fmt(radToDeg(TOLERANCES.connectionTangentRad), 6));

function select(r: ConnectionResult) {
  project.select(
    [r.connection.a.objectId, r.connection.b.objectId].filter((id) => project.byId.has(id)),
  );
}
/** Avvik fra perfekt motsatte tangenter for et forslag (radianer). */
function kinkOf(s: { a: PortRef; b: PortRef }): number {
  const a = project.portPoses.get(`${s.a.objectId}:${s.a.port}`);
  const b = project.portPoses.get(`${s.b.objectId}:${s.b.port}`);
  if (!a || !b) return Infinity;
  const d = Math.abs(a.headingRad - b.headingRad - Math.PI) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
}
const hasKink = (s: { a: PortRef; b: PortRef }) => kinkOf(s) > TOLERANCES.connectionTangentRad;

/** «Koble alle» kobler bare forslag uten tangentavvik – knekk må velges bevisst, én og én. */
function connectAll() {
  const ok = project.connectionSuggestions.filter((s) => !hasKink(s));
  const skipped = project.connectionSuggestions.length - ok.length;
  const n = project.connectAll(ok);
  if (skipped) {
    ui.notify(`${n} koblet. ${skipped} forslag har tangentavvik (knekk) og må kobles enkeltvis.`);
  }
}

type Issue = (typeof project.crossingIssues)[number];
const view = useViewStore();

/** Krysningsforhold 1:n (tan α = 1/n) for spisse vinkler – slik krysningsvinkler oppgis for sporveksler og kryss. */
function ratioText(angleRad: number): string {
  if (!(angleRad > 0.001 && angleRad <= 0.35)) return '';
  return ` (1:${fmt(1 / Math.tan(angleRad), 1)})`;
}

function heightText(x: Issue): string {
  if (x.deltaM === null) return '';
  const c = project.designParameters.minVerticalClearanceM;
  const status =
    x.separation === 'grade_separated'
      ? ' – planskilt'
      : x.separation === 'low_clearance'
        ? ` – under fri høyde ${fmtM(c ?? 0, 2)}`
        : '';
  return ` · Δh ${fmtM(x.deltaM, 2)}${status}`;
}

function crossingText(x: Issue): string {
  const where = `(${fmt(x.point[0], 1)}; ${fmt(x.point[1], 1)})${heightText(x)}`;
  if (x.kind === 'overlap')
    return `${x.a} og ${x.b} overlapper ${fmtM(x.overlapM ?? 0, 1)} ${where}`;
  if (x.kind === 'touch') {
    const other = x.endOf === x.a ? x.b : x.a;
    return `${x.endOf} ender på ${other} ${where}`;
  }
  return `${x.a} × ${x.b} krysser i ${fmtDeg(x.angleRad, 1)}${ratioText(x.angleRad)} ${where}`;
}
function showCrossing(x: Issue) {
  project.select([x.a, x.b]);
  view.focusPoint(x.point);
}
</script>

<template>
  <section class="connections" aria-labelledby="conn-h" data-testid="connections">
    <h2 id="conn-h">
      Koblinger ({{ project.connections.length }})
      <span v-if="errorCount" class="badge" style="color: var(--danger)" data-testid="conn-errors"
        >{{ errorCount }} avvik</span
      >
      <span v-else-if="project.connections.length" class="badge ok">alle OK</span>
    </h2>

    <p v-if="!project.connections.length" class="muted">
      Ingen koblinger. Bruk Koble (K) eller forslagene under.
    </p>
    <div
      v-for="r in project.connectionResults"
      :key="r.index"
      class="conn-row"
      :data-testid="`conn-row-${r.index}`"
    >
      <button class="who" @click="select(r)">
        {{ portName(r.connection.a) }} ↔ {{ portName(r.connection.b) }}
      </button>
      <span :class="['st', r.status]" :data-testid="`conn-status-${r.index}`">{{
        statusText(r)
      }}</span>
      <button
        class="btn secondary small"
        :data-testid="`conn-remove-${r.index}`"
        @click="project.removeConnection(r.index)"
      >
        Fjern
      </button>
    </div>

    <template v-if="project.connectionSuggestions.length">
      <h2 style="margin-top: 10px">Forslag ({{ project.connectionSuggestions.length }})</h2>
      <div
        v-for="(s, i) in project.connectionSuggestions"
        :key="`${portName(s.a)}|${portName(s.b)}`"
        class="conn-row"
      >
        <span class="who"
          >{{ portName(s.a) }} = {{ portName(s.b)
          }}<span v-if="hasKink(s)" class="st position" title="Tangentene møtes med knekk">
            · knekk {{ fmtDeg(kinkOf(s)) }}</span
          ></span
        >
        <button
          class="btn small"
          :data-testid="`suggest-connect-${i}`"
          @click="project.connect(s.a, s.b)"
        >
          Koble
        </button>
      </div>
      <div class="row-actions">
        <button class="btn secondary small" data-testid="suggest-connect-all" @click="connectAll">
          Koble alle
        </button>
      </div>
    </template>

    <p class="muted" style="margin-top: 8px; font-size: 11px">
      Posisjonstoleranse {{ fmt(TOLERANCES.connectionPositionM * 1e6, 3) }} µm. Tangenttoleranse
      {{ tangentTolDeg }}° er en <b>foreløpig testverdi</b>, ikke faglig fastsatt. Avvik rapporteres
      – ingenting flyttes automatisk.
    </p>

    <h2 style="margin-top: 14px" data-testid="crossings-heading">
      Kryssende spor ({{ project.openCrossingCount }})
      <span class="badge" style="color: var(--warn)">ikke vurdert</span>
    </h2>
    <template v-if="project.elevationConflicts.length">
      <h2 style="margin-top: 14px" data-testid="elev-conflicts-heading">
        Kote-konflikter ({{ project.elevationConflicts.length }})
      </h2>
      <div
        v-for="(c, i) in project.elevationConflicts"
        :key="i"
        class="conn-row"
        :data-testid="`elev-conflict-${i}`"
      >
        <span class="who st position"
          >{{ c.ports.join(' = ') }}: {{ c.values.map((v) => fmt(v, 3)).join(' ≠ ') }}</span
        >
      </div>
    </template>
    <p v-if="!project.crossingIssues.length" class="muted" data-testid="no-crossings">
      Ingen kryssende spor funnet.
    </p>
    <div
      v-for="(x, i) in project.crossingIssues"
      :key="`${x.key}-${x.kind}-${x.point[0]}-${x.point[1]}`"
      :class="['conn-row', { acked: x.acknowledged || x.separation === 'grade_separated' }]"
      :data-testid="`cross-row-${i}`"
      :data-kind="x.kind"
    >
      <button class="who" :title="crossingText(x)" @click="showCrossing(x)">
        {{ crossingText(x) }}
      </button>
      <button
        class="btn secondary small"
        :title="
          x.acknowledged
            ? 'Opphev bekreftelsen'
            : 'Bekreft at kryssingen er bevisst (f.eks. bro/tunnel)'
        "
        :data-testid="`cross-ack-${i}`"
        @click="project.toggleCrossingAck(x.key)"
      >
        {{
          x.acknowledged
            ? 'Angre'
            : x.separation === 'grade_separated'
              ? 'Planskilt ✓'
              : 'Planskilt'
        }}
      </button>
    </div>
    <p class="muted" style="margin-top: 6px; font-size: 11px">
      Spor kan ikke krysse hverandre i samme plan uten sporkryss eller kryssveksel, og en
      T-forbindelse krever sporveksel. «Planskilt» bekrefter at du bevisst har tegnet en kryssing i
      ulik høyde (eller settes automatisk ut fra kote og fri høyde i Prosjektinnstillinger). Ikke
      vurdert mot regelverk.
    </p>

    <h2 style="margin-top: 14px" data-testid="vehicle-heading">
      Kjøretøykontroll
      <span class="badge" style="color: var(--warn)">ikke vurdert mot regelverk</span>
    </h2>
    <p v-if="!project.vehicleResult" class="muted" data-testid="vehicle-none">
      Ingen kjøretøy er satt. Oppgi lengde, boggiavstand, bredde og sideklaring (dine egne mål) i
      Fil → Prosjektinnstillinger.
    </p>
    <template v-else>
      <p class="muted" style="font-size: 11px" data-testid="vehicle-summary">
        {{ project.designParameters.vehicle?.name }}: L
        {{ fmt(project.designParameters.vehicle?.lengthM ?? 0, 2) }} m, boggiavstand
        {{ fmt(project.designParameters.vehicle?.bogieCentreM ?? 0, 2) }} m, bredde
        {{ fmt(project.designParameters.vehicle?.widthM ?? 0, 2) }} m, klaring
        {{ fmt(project.designParameters.vehicle?.marginM ?? 0, 2) }} m per side.
      </p>
      <p
        v-for="id in project.vehicleResult.tooTight"
        :key="id"
        class="warn-line"
        :data-testid="`vehicle-toosmall-${id}`"
      >
        ⚠ {{ id }}: radien er for liten for dette kjøretøyet (R ≤ halve boggiavstanden).
      </p>
      <h3 class="overview-h">Sporavstand mellom nabospor</h3>
      <p
        v-if="!project.vehicleResult.spacing.length"
        class="muted"
        data-testid="vehicle-no-spacing"
      >
        Ingen nabospor funnet (1–15 m fra hverandre).
      </p>
      <div
        v-for="(s, i) in project.vehicleResult.spacing"
        :key="`${s.a}|${s.b}`"
        :class="['conn-row', { acked: s.status === 'ok' }]"
        :data-testid="`vehicle-spacing-${i}`"
        :data-status="s.status"
      >
        <button class="who" @click="project.select([s.a, s.b])">
          {{ s.a }} ↔ {{ s.b }}: {{ fmt(s.distanceM, 2) }} m (kreves {{ fmt(s.requiredM, 2) }} m) –
          {{ s.status === 'ok' ? 'tilstrekkelig etter dine mål' : 'for liten' }}
        </button>
      </div>
      <h3 class="overview-h">Utsving i kurver</h3>
      <p v-if="!project.vehicleResult.curves.length" class="muted">Ingen sirkelkurver.</p>
      <div
        v-for="(c, i) in project.vehicleResult.curves"
        :key="`${c.id}-${c.radiusM}`"
        class="conn-row"
        :data-testid="`vehicle-curve-${i}`"
      >
        <button class="who" @click="project.select([c.id])">
          {{ c.id }}: R {{ fmt(c.radiusM, 1) }} m – utsving innover
          {{ fmt(c.innerM * 1000, 0) }} mm, utover {{ fmt(c.outerM * 1000, 0) }} mm
        </button>
      </div>
      <p class="muted" style="margin-top: 6px; font-size: 11px">
        Beregnet med dine mål: boggisentrene på aksen, utsving δi = R − √(R² − (B/2)²) innover og δo
        = √((B/2+O)² + R² − (B/2)²) − R utover. Nødvendig senteravstand = bredde + 2 × klaring +
        utsving for begge spor ved nærmeste punkt. Ingen kantsteg, overhøyde, vertikalkurver eller
        regelverkskrav er vurdert – dette er <b>ikke</b> en godkjent frihøydekontroll.
      </p>
    </template>
  </section>
</template>
