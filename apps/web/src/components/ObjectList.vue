<script setup lang="ts">
import { getTurnoutType, isCrossing, isTrack, isTurnout, type RailObject } from '@railcad/domain';
import { geometryEngine as engine } from '../engine';
import { fmt, fmtM } from '../format';
import { useProjectStore } from '../stores/project';

const project = useProjectStore();

function summary(o: RailObject): string {
  if (isTrack(o)) {
    const len = fmtM(engine.length(o.geometry));
    return o.geometry.kind === 'line'
      ? len
      : `R ${fmtM(Math.abs(o.geometry.signedRadiusM), 1)} · ${len}`;
  }
  if (isCrossing(o))
    return `1:${fmt(o.crossing.ratioN, 1)} · ${fmtM(2 * o.crossing.halfLengthM, 1)}`;
  if (isTurnout(o)) return getTurnoutType(o.turnout.catalogId)?.name ?? o.turnout.catalogId;
  const t = project.byId.get(o.dimension.kind === 'length' ? o.dimension.targetId : '');
  const layout = engine.dimensionLayout(o.dimension, () =>
    t && isTrack(t) ? t.geometry : undefined,
  );
  return layout ? fmtM(layout.valueM) : '–';
}
function kindLabel(o: RailObject): string {
  if (isTrack(o)) return o.geometry.kind === 'line' ? 'Rett' : 'Kurve';
  if (isCrossing(o)) return o.crossing.slip ? 'Kryssveksel' : 'Sporkryss';
  if (isTurnout(o)) return o.turnout.hand === 'left' ? 'Veksel v.' : 'Veksel h.';
  return o.dimension.kind === 'length' ? 'Lengdemål' : 'Avstandsmål';
}

function pick(id: string, e: MouseEvent) {
  if (e.shiftKey) project.toggleSelect(id);
  else project.select([id]);
}
</script>

<template>
  <section class="objects" aria-labelledby="obj-h">
    <h2 id="obj-h">Objekter ({{ project.objects.length }})</h2>
    <ul class="object-list" data-testid="object-list">
      <li v-for="o in project.objects" :key="o.id">
        <button
          :aria-current="project.selection.includes(o.id)"
          :data-testid="`object-${o.id}`"
          @click="pick(o.id, $event)"
        >
          <span>{{ o.id }}</span>
          <span class="muted">{{ kindLabel(o) }}</span>
          <span class="sum">{{ summary(o) }}</span>
          <span v-if="project.lockedIds.has(o.id)" title="Låst" :data-testid="`object-lock-${o.id}`"
            >🔒</span
          >
          <span
            v-if="project.hiddenIds.has(o.id)"
            class="muted"
            title="På skjult lag"
            :data-testid="`object-hidden-${o.id}`"
            >skjult</span
          >
        </button>
      </li>
    </ul>
    <p v-if="!project.objects.length" class="muted">Ingen objekter ennå. Velg et tegneverktøy.</p>
  </section>
</template>
