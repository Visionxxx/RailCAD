<script setup lang="ts">
import { TOOL_SHORTCUTS, useTools } from '../tools/controller';
import type { ToolId } from '../tools/types';

const ctrl = useTools();

// SVG-baner (24×24) – enkle, lesbare symboler for hvert verktøy.
const tools: Array<{ id: ToolId; label: string; paths: string[]; gap?: boolean }> = [
  { id: 'select', label: 'Marker', paths: ['M5 3l12 8-5.5 1.2L9 18z'] },
  {
    id: 'pan',
    label: 'Panorer',
    paths: [
      'M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
    ],
    gap: true,
  },
  { id: 'line', label: 'Rett spor', paths: ['M4 19L20 5', 'M4 19h.01M20 5h.01'] },
  { id: 'arc', label: 'Sirkelkurve', paths: ['M4 20C4 11 11 4 20 4'], gap: false },
  { id: 'parallel', label: 'Parallelt spor', paths: ['M3 9h18M3 15h18'] },
  {
    id: 'connect',
    label: 'Koble',
    paths: ['M10 8H8a4 4 0 0 0 0 8h2', 'M14 8h2a4 4 0 0 1 0 8h-2', 'M9 12h6'],
    gap: true,
  },
  {
    id: 'turnout',
    label: 'Sporveksel',
    paths: ['M3 12h18', 'M8 12c4 0 6-5 13-5'],
  },
  {
    id: 'crossing',
    label: 'Sporkryss',
    paths: ['M4 6l16 12M4 18L20 6'],
  },
  { id: 'rotate', label: 'Roter', paths: ['M20 12a8 8 0 1 1-2.3-5.7', 'M20 4v4h-4'] },
  {
    id: 'measure-length',
    label: 'Mål lengde',
    paths: ['M3 12h18M3 8v8M21 8v8M7 12l2-2M7 12l2 2M17 12l-2-2M17 12l-2 2'],
  },
  { id: 'measure-distance', label: 'Mål avstand', paths: ['M5 19L19 5', 'M5 15v4h4M19 9V5h-4'] },
  {
    id: 'delete',
    label: 'Slett',
    paths: ['M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6'],
    gap: true,
  },
];
</script>

<template>
  <nav class="toolbar" aria-label="Verktøy">
    <template v-for="t in tools" :key="t.id">
      <div v-if="t.gap" class="sep" />
      <button
        :aria-pressed="ctrl.activeId.value === t.id"
        :aria-label="`${t.label} (${TOOL_SHORTCUTS[t.id]})`"
        :title="`${t.label} (${TOOL_SHORTCUTS[t.id]})`"
        :data-testid="`tool-${t.id}`"
        @click="ctrl.setTool(t.id)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path v-for="(d, i) in t.paths" :key="i" :d="d" />
        </svg>
        <span class="key" aria-hidden="true">{{ TOOL_SHORTCUTS[t.id] }}</span>
      </button>
    </template>
  </nav>
</template>
