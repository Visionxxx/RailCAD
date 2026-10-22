<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useTools } from '../tools/controller';

const ctrl = useTools();
const root = ref<HTMLElement | null>(null);

// Flytt fokus til første aktive valg slik at menyen kan brukes med tastatur.
watch(
  () => ctrl.portMenu.value,
  async (m) => {
    if (!m) return;
    await nextTick();
    root.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  },
);
</script>

<template>
  <div
    v-if="ctrl.portMenu.value"
    ref="root"
    class="port-menu"
    role="menu"
    :aria-label="ctrl.portMenu.value.title"
    data-testid="port-menu"
    :style="{
      left: `${ctrl.portMenu.value.screen[0] + 8}px`,
      top: `${ctrl.portMenu.value.screen[1] + 8}px`,
    }"
    @pointerdown.stop
    @keydown.esc.stop.prevent="ctrl.dismissPortMenu()"
  >
    <div class="port-menu-title">{{ ctrl.portMenu.value.title }}</div>
    <button
      v-for="it in ctrl.portMenu.value.items"
      :key="it.id"
      role="menuitem"
      :disabled="it.disabled"
      :data-testid="`port-menu-${it.id}`"
      :title="it.note"
      @click="ctrl.choosePortAction(it.id)"
    >
      {{ it.label }}<span v-if="it.note" class="muted"> – {{ it.note }}</span>
    </button>
  </div>
</template>
