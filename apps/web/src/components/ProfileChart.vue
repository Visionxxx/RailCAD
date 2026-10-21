<script setup lang="ts">
import { computed } from 'vue';
import { fmt } from '../format';
import { buildProfile } from '../rendering/profile';
import { useProjectStore } from '../stores/project';

const props = defineProps<{ objectId: string }>();
const project = useProjectStore();

const profile = computed(() =>
  buildProfile(props.objectId, project.byId, project.connections, project.elevations.effective),
);

const W = 290;
const H = 120;
const PAD = { l: 38, r: 8, t: 10, b: 22 };

const model = computed(() => {
  const p = profile.value;
  if (!p) return null;
  const zs = p.segments.flatMap((s) => [s.zStart, s.zEnd]).filter((v): v is number => v !== null);
  if (zs.length < 2 || p.totalM <= 0) return null;
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const span = Math.max(zMax - zMin, 0.5);
  const x = (s: number) => PAD.l + (s / p.totalM) * (W - PAD.l - PAD.r);
  const y = (z: number) =>
    PAD.t + (1 - (z - (zMin - span * 0.1)) / (span * 1.2)) * (H - PAD.t - PAD.b);
  const lines = p.segments
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.zStart !== null && s.zEnd !== null)
    .map(({ s, i }) => {
      const st = p.stations[i] as number;
      const grade = (((s.zEnd as number) - (s.zStart as number)) / s.lengthM) * 1000;
      return {
        id: s.objectId,
        x1: x(st),
        y1: y(s.zStart as number),
        x2: x(st + s.lengthM),
        y2: y(s.zEnd as number),
        label: `${fmt(grade, 1)}‰`,
        selected: s.objectId === props.objectId,
      };
    });
  return { lines, zMin, zMax, totalM: p.totalM, x, y };
});
</script>

<template>
  <div v-if="model" class="profile" data-testid="profile">
    <h3 class="overview-h">Lengdeprofil (sporkjede)</h3>
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      :aria-label="`Lengdeprofil, ${fmt(model.totalM, 1)} m`"
    >
      <line :x1="PAD.l" :y1="H - PAD.b" :x2="W - PAD.r" :y2="H - PAD.b" class="axis-line" />
      <line :x1="PAD.l" :y1="PAD.t" :x2="PAD.l" :y2="H - PAD.b" class="axis-line" />
      <text :x="PAD.l - 4" :y="PAD.t + 4" text-anchor="end" class="axis-text">
        {{ fmt(model.zMax, 1) }}
      </text>
      <text :x="PAD.l - 4" :y="H - PAD.b" text-anchor="end" class="axis-text">
        {{ fmt(model.zMin, 1) }}
      </text>
      <text :x="PAD.l" :y="H - 6" class="axis-text">0</text>
      <text :x="W - PAD.r" :y="H - 6" text-anchor="end" class="axis-text">
        {{ fmt(model.totalM, 0) }} m
      </text>
      <g v-for="(l, i) in model.lines" :key="i">
        <line
          :x1="l.x1"
          :y1="l.y1"
          :x2="l.x2"
          :y2="l.y2"
          :class="['prof-line', { sel: l.selected }]"
          :data-testid="`profile-seg-${l.id}`"
        />
        <text
          :x="(l.x1 + l.x2) / 2"
          :y="Math.min(l.y1, l.y2) - 4"
          text-anchor="middle"
          class="axis-text"
        >
          {{ l.label }}
        </text>
      </g>
    </svg>
  </div>
</template>
