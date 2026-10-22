<script setup lang="ts">
import { computed } from 'vue';
import { gradePermille } from '@railcad/geometry-ts';
import { fmt, portLabel } from '../format';
import { useProjectStore } from '../stores/project';
import NumberField from './NumberField.vue';

const props = defineProps<{
  objectId: string;
  /** Porter på objektet, i visningsrekkefølge. */
  ports: readonly string[];
  disabled?: boolean;
  /** Spor: vis stigning mellom start og slutt. */
  showGrade?: boolean;
  lengthM?: number;
}>();

const project = useProjectStore();
const key = (port: string) => `${props.objectId}:${port}`;
const z = (port: string) => project.elevations.effective.get(key(port)) ?? null;
const shared = (port: string) =>
  project.connections.some(
    (c) =>
      (c.a.objectId === props.objectId && c.a.port === port) ||
      (c.b.objectId === props.objectId && c.b.port === port),
  );
const grade = computed(() =>
  props.showGrade && props.lengthM
    ? gradePermille(z('start') ?? undefined, z('end') ?? undefined, props.lengthM)
    : null,
);
</script>

<template>
  <div class="elevation" data-testid="elevation">
    <h3 class="overview-h">Høyde (kote)</h3>
    <NumberField
      v-for="p in ports"
      :id="`elev-${p}`"
      :key="p"
      :disabled="disabled"
      :label="`Kote ${portLabel(p)}${shared(p) ? ' (delt)' : ''}`"
      unit="m"
      :model-value="z(p)"
      nullable
      @commit="(n) => project.setPortElevation(key(p), n)"
      @clear="project.setPortElevation(key(p), null)"
    />
    <div v-if="showGrade" class="field ro">
      <label>Stigning</label>
      <output data-testid="prop-grade">{{
        grade === null ? 'ukjent' : `${fmt(grade, 2)} ‰`
      }}</output>
    </div>
    <p class="muted" style="font-size: 11px">
      Tomt felt = ukjent kote. Koblede porter deler kote; høyden er lineær mellom endene.
    </p>
  </div>
</template>
