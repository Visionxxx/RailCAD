<script setup lang="ts">
import { ref, watch } from 'vue';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';

const project = useProjectStore();
const ui = useUiStore();
const name = ref('');
const description = ref('');

watch(
  () => ui.settingsOpen,
  (open) => {
    if (open) {
      name.value = project.meta.name;
      description.value = project.meta.description ?? '';
    }
  },
  { immediate: true },
);

function apply() {
  const trimmed = name.value.trim();
  if (!trimmed) return;
  project.updateMeta({ name: trimmed, description: description.value.trim() || undefined });
  ui.settingsOpen = false;
}
</script>

<template>
  <div v-if="ui.settingsOpen" class="backdrop" @keydown.esc="ui.settingsOpen = false">
    <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="set-title" data-testid="settings" @submit.prevent="apply">
      <h2 id="set-title">Prosjektinnstillinger</h2>
      <label>Prosjektnavn <input v-model="name" type="text" data-testid="project-name" required autofocus /></label>
      <label>Beskrivelse <textarea v-model="description" rows="3" data-testid="project-description" /></label>
      <p class="muted">Enheter: meter. Koordinatsystem: lokalt XY (flere systemer kommer i senere fase).</p>
      <div class="actions">
        <button type="button" class="btn secondary" @click="ui.settingsOpen = false">Avbryt</button>
        <button type="submit" class="btn" data-testid="settings-ok">Bruk</button>
      </div>
    </form>
  </div>
</template>
