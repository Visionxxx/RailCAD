<script setup lang="ts">
import { computed } from 'vue';
import { backgroundContentBounds, type Background } from '@railcad/domain';
import { useActions } from '../actions';
import { fmt, degToRad, radToDeg } from '../format';
import { backgroundWorldBounds } from '../rendering/background';
import { useProjectStore } from '../stores/project';
import { useViewStore } from '../stores/view';
import { useTools } from '../tools/controller';
import NumberField from './NumberField.vue';

const project = useProjectStore();
const view = useViewStore();
const ctrl = useTools();
const actions = useActions();

const active = computed<Background | null>(
  () => project.backgrounds.find((b) => b.id === view.activeBackgroundId) ?? null,
);
const sizeM = computed(() => {
  const b = active.value;
  if (!b) return null;
  const c = backgroundContentBounds(b);
  return {
    w: (c.maxX - c.minX) * b.placement.scaleMPerUnit,
    h: (c.maxY - c.minY) * b.placement.scaleMPerUnit,
  };
});
const kindLabel = (b: Background) =>
  b.kind === 'dxf' ? 'DXF' : b.source === 'pdf' ? 'PDF' : 'Bilde';

function edit(label: string, change: (b: Background) => Background) {
  const id = active.value?.id;
  if (id) project.updateBackground(id, change, label);
}
const setOrigin = (axis: 0 | 1, n: number) =>
  edit('Flytt bakgrunn', (b) => ({
    ...b,
    placement: {
      ...b.placement,
      origin: axis === 0 ? [n, b.placement.origin[1]] : [b.placement.origin[0], n],
    },
  }));
const setScale = (n: number) =>
  edit('Sett bakgrunnsskala', (b) => ({
    ...b,
    placement: { ...b.placement, scaleMPerUnit: n, scaleConfirmed: true },
  }));
const setRotation = (deg: number) =>
  edit('Roter bakgrunn', (b) => ({
    ...b,
    placement: { ...b.placement, rotationRad: degToRad(deg) },
  }));
function setOpacity(e: Event) {
  const v = Number((e.target as HTMLInputElement).value) / 100;
  edit('Endre dekkevne', (b) => ({ ...b, opacity: v }));
}
function toggle(b: Background) {
  project.updateBackground(
    b.id,
    (x) => ({ ...x, visible: !x.visible }),
    b.visible ? 'Skjul bakgrunn' : 'Vis bakgrunn',
  );
}
function remove(b: Background) {
  project.removeBackground(b.id);
  if (view.activeBackgroundId === b.id) view.activeBackgroundId = null;
}
function fit() {
  if (active.value) view.fitToBounds(backgroundWorldBounds(active.value));
}
const positive = (n: number) =>
  n > 0 && Number.isFinite(n) ? null : 'Skalaen må være større enn 0.';
</script>

<template>
  <section class="backgrounds" aria-labelledby="bg-h" data-testid="backgrounds">
    <h2 id="bg-h">
      Bakgrunner ({{ project.backgrounds.length }})
      <button
        class="btn secondary small"
        data-testid="bg-import"
        @click="actions.importBackground()"
      >
        Importer …
      </button>
    </h2>

    <p v-if="!project.backgrounds.length" class="muted">
      Ingen bakgrunner. Importer DXF, PDF eller bilde som referanse under sporplanen.
    </p>

    <div
      v-for="b in project.backgrounds"
      :key="b.id"
      :class="['bg-row', { active: view.activeBackgroundId === b.id }]"
      :data-testid="`bg-row-${b.id}`"
    >
      <input
        type="checkbox"
        :checked="b.visible"
        :aria-label="`Vis ${b.name}`"
        :data-testid="`bg-visible-${b.id}`"
        @change="toggle(b)"
      />
      <button
        class="who"
        :aria-current="view.activeBackgroundId === b.id"
        @click="view.activeBackgroundId = b.id"
      >
        {{ b.name }}
      </button>
      <span class="badge">{{ kindLabel(b) }}</span>
      <span
        v-if="!b.placement.scaleConfirmed"
        class="badge"
        style="color: var(--warn)"
        :data-testid="`bg-unscaled-${b.id}`"
        >ikke skalert</span
      >
      <button class="btn secondary small" :data-testid="`bg-remove-${b.id}`" @click="remove(b)">
        Fjern
      </button>
    </div>

    <div v-if="active" class="bg-details" data-testid="bg-details">
      <div class="field">
        <label for="bg-opacity">Dekkevne</label>
        <input
          id="bg-opacity"
          type="range"
          min="5"
          max="100"
          :value="Math.round(active.opacity * 100)"
          data-testid="bg-opacity"
          @change="setOpacity"
        />
      </div>
      <NumberField
        id="bg-origin-x"
        label="Origo X"
        unit="m"
        :model-value="active.placement.origin[0]"
        @commit="(n) => setOrigin(0, n)"
      />
      <NumberField
        id="bg-origin-y"
        label="Origo Y"
        unit="m"
        :model-value="active.placement.origin[1]"
        @commit="(n) => setOrigin(1, n)"
      />
      <NumberField
        id="bg-scale"
        :label="active.kind === 'dxf' ? 'Skala (m per enhet)' : 'Skala (m per piksel)'"
        :decimals="6"
        :model-value="active.placement.scaleMPerUnit"
        :validate="positive"
        @commit="setScale"
      />
      <NumberField
        id="bg-rotation"
        label="Rotasjon"
        unit="°"
        :decimals="4"
        :model-value="radToDeg(active.placement.rotationRad)"
        @commit="setRotation"
      />
      <div v-if="sizeM" class="field ro">
        <label>Størrelse</label>
        <output data-testid="bg-size">{{ fmt(sizeM.w, 1) }} × {{ fmt(sizeM.h, 1) }} m</output>
      </div>
      <p
        v-if="!active.placement.scaleConfirmed"
        class="muted"
        style="color: var(--warn)"
        role="status"
      >
        Skalaen er ukjent/antatt. Bruk «Skaler med to punkter».
      </p>
      <div class="row-actions">
        <button class="btn small" data-testid="bg-scale-tool" @click="ctrl.setTool('bg-scale')">
          Skaler med to punkter
        </button>
        <button
          class="btn secondary small"
          data-testid="bg-move-tool"
          @click="ctrl.setTool('bg-move')"
        >
          Flytt fra → til
        </button>
        <button class="btn secondary small" data-testid="bg-fit" @click="fit">
          Tilpass visning
        </button>
      </div>
      <p class="muted" style="font-size: 11px">
        Bakgrunnen er referanse og ikke prosjekteringsgeometri: den påvirker ingen kontroller og tas
        ikke med i DXF-eksporten. Hjørner i DXF-bakgrunnen kan snappes til i
        skaler-/flytt-verktøyene.
      </p>
    </div>
  </section>
</template>
