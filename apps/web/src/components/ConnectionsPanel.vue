<script setup lang="ts">
import { computed } from 'vue';
import { TOLERANCES, type ConnectionResult, type PortRef } from '@railcad/geometry-api';
import { fmt, fmtDeg, fmtM, portLabel, radToDeg } from '../format';
import { useProjectStore } from '../stores/project';

const project = useProjectStore();

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
function connectAll() {
  // Hver kobling er sin egen angrebare handling.
  for (const s of [...project.connectionSuggestions]) project.connect(s.a, s.b);
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
        <span class="who">{{ portName(s.a) }} = {{ portName(s.b) }}</span>
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
  </section>
</template>
