<script setup lang="ts">
import { computed } from 'vue';
import type { SnapKind } from '@railcad/geometry-api';
import { fmt } from '../format';
import { useTools } from '../tools/controller';
import { SNAP_LABELS, useViewStore } from '../stores/view';

const view = useViewStore();
const ctrl = useTools();

const kinds = Object.keys(SNAP_LABELS) as SnapKind[];
const cursorText = computed(() =>
  view.cursor ? `X ${fmt(view.cursor[0], 3)}  Y ${fmt(view.cursor[1], 3)}` : 'X –  Y –',
);
</script>

<template>
  <footer class="statusbar" data-testid="statusbar">
    <span class="hint" data-testid="hint" aria-live="polite">{{ ctrl.hint.value }}</span>
    <span class="mono" data-testid="cursor-pos">{{ cursorText }}</span>
    <span class="mono hide-sm" data-testid="zoom">{{ fmt(view.view.scale, 2) }} px/m</span>
    <span class="hide-sm" data-testid="active-tool">{{ ctrl.active.value.label }}</span>
    <span class="hide-sm">Enhet: m</span>
    <span class="snaps" role="group" aria-label="Snapping">
      <button
        v-for="k in kinds"
        :key="k"
        :aria-pressed="view.snapOn[k]"
        :title="`Snap: ${SNAP_LABELS[k]}`"
        :data-testid="`snap-${k}`"
        @click="view.snapOn[k] = !view.snapOn[k]"
      >
        {{ SNAP_LABELS[k] }}
      </button>
    </span>
    <span class="disclaimer hide-sm" title="Regelverkskontroll er ikke implementert">Skisse – ikke regelverkskontrollert</span>
  </footer>
</template>
