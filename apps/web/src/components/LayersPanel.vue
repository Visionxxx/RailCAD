<script setup lang="ts">
import { computed, ref } from 'vue';
import { DEFAULT_LAYER_ID } from '@railcad/domain';
import { useProjectStore } from '../stores/project';

const project = useProjectStore();
const newName = ref('');
const renameText = ref('');

const counts = computed(() => {
  const m = new Map<string, number>();
  for (const o of project.objects) {
    const id = o.layerId ?? DEFAULT_LAYER_ID;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
});
const active = computed(() => project.layerById.get(project.activeLayerId));

function add() {
  if (project.addLayer(newName.value)) newName.value = '';
}
function pick(id: string) {
  project.activeLayerId = id;
  renameText.value = project.layerById.get(id)?.name ?? '';
}
function rename() {
  const a = active.value;
  const name = renameText.value.trim().slice(0, 60);
  if (a && name && name !== a.name)
    project.updateLayer(a.id, (l) => ({ ...l, name }), 'Gi lag nytt navn');
  else renameText.value = a?.name ?? '';
}
</script>

<template>
  <section class="layers" aria-labelledby="lag-h" data-testid="layers">
    <h2 id="lag-h">Lag ({{ project.layers.length }})</h2>
    <div
      v-for="l in project.layers"
      :key="l.id"
      :class="['layer-row', { active: project.activeLayerId === l.id }]"
      :data-testid="`layer-row-${l.id}`"
    >
      <input
        type="checkbox"
        :checked="l.visible"
        :aria-label="`Vis lag ${l.name}`"
        :title="l.visible ? 'Synlig – klikk for å skjule' : 'Skjult – klikk for å vise'"
        :data-testid="`layer-visible-${l.id}`"
        @change="
          project.updateLayer(
            l.id,
            (x) => ({ ...x, visible: !x.visible }),
            l.visible ? 'Skjul lag' : 'Vis lag',
          )
        "
      />
      <label class="lock-toggle" :title="l.locked ? 'Låst – klikk for å låse opp' : 'Lås lag'">
        <input
          type="checkbox"
          :checked="l.locked"
          :aria-label="`Lås lag ${l.name}`"
          :data-testid="`layer-locked-${l.id}`"
          @change="
            project.updateLayer(
              l.id,
              (x) => ({ ...x, locked: !x.locked }),
              l.locked ? 'Lås opp lag' : 'Lås lag',
            )
          "
        />
        <span aria-hidden="true">🔒</span>
      </label>
      <button
        class="who"
        :aria-current="project.activeLayerId === l.id"
        :title="'Gjør til aktivt lag: nye objekter legges her'"
        :data-testid="`layer-name-${l.id}`"
        @click="pick(l.id)"
      >
        {{ l.name }}
      </button>
      <span class="muted" :data-testid="`layer-count-${l.id}`">{{ counts.get(l.id) ?? 0 }}</span>
      <button
        v-if="l.id !== DEFAULT_LAYER_ID"
        class="btn secondary small"
        :aria-label="`Slett lag ${l.name}`"
        :data-testid="`layer-remove-${l.id}`"
        @click="project.removeLayer(l.id)"
      >
        ×
      </button>
    </div>

    <form class="layer-add" @submit.prevent="add">
      <input
        v-model="newName"
        placeholder="Nytt lag …"
        aria-label="Navn på nytt lag"
        data-testid="layer-new-name"
      />
      <button class="btn small" type="submit" data-testid="layer-add">Legg til</button>
    </form>
    <form
      v-if="active && active.id !== DEFAULT_LAYER_ID"
      class="layer-add"
      @submit.prevent="rename"
    >
      <input
        v-model="renameText"
        aria-label="Nytt navn på aktivt lag"
        data-testid="layer-rename"
        @focus="renameText = active.name"
        @blur="rename"
      />
    </form>
    <p class="muted" style="font-size: 11px; margin-top: 6px">
      Aktivt lag (uthevet) får nye objekter. Skjulte lag er ikke tegnet eller valgbare; låste lag
      kan ikke endres.
    </p>
  </section>
</template>
