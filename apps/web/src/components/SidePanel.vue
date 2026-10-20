<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useProjectStore } from '../stores/project';
import { useUiStore, type SideTab } from '../stores/ui';
import BackgroundPanel from './BackgroundPanel.vue';
import ConnectionsPanel from './ConnectionsPanel.vue';
import ObjectList from './ObjectList.vue';
import PropertiesPanel from './PropertiesPanel.vue';

const project = useProjectStore();
const ui = useUiStore();

/** Avvik som trenger oppmerksomhet: koblingsavvik og kryssende spor som ikke er bekreftet. */
const connectionIssues = computed(
  () =>
    project.connectionResults.filter((r) => r.status !== 'ok').length + project.openCrossingCount,
);

const tabs = computed(() => [
  {
    id: 'properties' as const,
    label: 'Egenskaper',
    count: project.selection.length || null,
    alert: false,
  },
  {
    id: 'objects' as const,
    label: 'Objekter',
    count: project.objects.length || null,
    alert: false,
  },
  {
    id: 'connections' as const,
    label: 'Kontroll',
    count: connectionIssues.value || project.connections.length || null,
    alert: connectionIssues.value > 0,
  },
  {
    id: 'backgrounds' as const,
    label: 'Bakgrunn',
    count: project.backgrounds.length || null,
    alert: false,
  },
]);

const root = ref<HTMLElement | null>(null);

/**
 * Når man velger noe (på tegneflaten eller i objektlisten), vises egenskapene.
 * Fanene Koblinger og Bakgrunn beholdes, siden valg der ofte er en del av arbeidet i den fanen.
 */
watch(
  () => project.selection,
  (sel, old) => {
    if (sel.length && sel !== old && ui.sideTab !== 'connections' && ui.sideTab !== 'backgrounds') {
      ui.showTab('properties');
    }
  },
);

/** Piltaster flytter mellom faner (WAI-ARIA tabs). */
async function onKey(e: KeyboardEvent, index: number) {
  const n = tabs.value.length;
  const next =
    e.key === 'ArrowRight'
      ? (index + 1) % n
      : e.key === 'ArrowLeft'
        ? (index - 1 + n) % n
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? n - 1
            : -1;
  if (next < 0) return;
  e.preventDefault();
  ui.showTab((tabs.value[next] as { id: SideTab }).id);
  await nextTick();
  root.value?.querySelector<HTMLButtonElement>('[role=tab][aria-selected=true]')?.focus();
}
</script>

<template>
  <aside ref="root" class="side" aria-label="Egenskaper, objekter, koblinger og bakgrunner">
    <div class="tablist" role="tablist" aria-label="Panelvisning">
      <button
        v-for="(t, i) in tabs"
        :id="`tab-${t.id}`"
        :key="t.id"
        role="tab"
        :aria-selected="ui.sideTab === t.id"
        :aria-controls="`tabpanel-${t.id}`"
        :tabindex="ui.sideTab === t.id ? 0 : -1"
        :data-testid="`tab-${t.id}`"
        @click="ui.showTab(t.id)"
        @keydown="onKey($event, i)"
      >
        {{ t.label }}
        <span
          v-if="t.count !== null"
          :class="['count', { alert: t.alert }]"
          :data-testid="`tab-count-${t.id}`"
          >{{ t.count }}</span
        >
        <span v-else-if="t.alert" class="count alert" aria-hidden="true">!</span>
        <span v-if="t.alert" class="sr-only"> (har avvik)</span>
      </button>
    </div>

    <div
      v-for="t in tabs"
      v-show="ui.sideTab === t.id"
      :id="`tabpanel-${t.id}`"
      :key="t.id"
      class="tab-body"
      role="tabpanel"
      :aria-labelledby="`tab-${t.id}`"
      :data-testid="`tabpanel-${t.id}`"
    >
      <PropertiesPanel v-if="t.id === 'properties'" />
      <ObjectList v-else-if="t.id === 'objects'" />
      <ConnectionsPanel v-else-if="t.id === 'connections'" />
      <BackgroundPanel v-else />
    </div>
  </aside>
</template>
