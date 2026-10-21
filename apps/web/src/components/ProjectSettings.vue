<script setup lang="ts">
import { ref, watch } from 'vue';
import { fmt, parseNumber } from '../format';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';

const project = useProjectStore();
const ui = useUiStore();
const name = ref('');
const description = ref('');
const clearance = ref('');
const vehicle = ref({ name: '', length: '', bogie: '', width: '', margin: '' });
const error = ref('');

const text = (n: number | undefined) => (n === undefined ? '' : fmt(n, 3));

watch(
  () => ui.settingsOpen,
  (open) => {
    if (!open) return;
    name.value = project.meta.name;
    description.value = project.meta.description ?? '';
    const dp = project.designParameters;
    clearance.value = text(dp.minVerticalClearanceM);
    const v = dp.vehicle;
    vehicle.value = {
      name: v?.name ?? '',
      length: text(v?.lengthM),
      bogie: text(v?.bogieCentreM),
      width: text(v?.widthM),
      margin: text(v?.marginM),
    };
    error.value = '';
  },
  { immediate: true },
);

/** Tomt = ikke satt. Ugyldig tall gir feilmelding. */
function optional(
  textValue: string,
  label: string,
  min: number,
  max: number,
): number | undefined | null {
  if (!textValue.trim()) return undefined;
  const n = parseNumber(textValue);
  if (n === null || n < min || n > max) {
    error.value = `${label}: oppgi et tall mellom ${min} og ${max}.`;
    return null;
  }
  return n;
}

function apply() {
  const trimmed = name.value.trim();
  if (!trimmed) return;
  error.value = '';
  const clr = optional(clearance.value, 'Fri høyde', 0, 100);
  if (clr === null) return;

  // Kjøretøy: enten alle felt eller ingen.
  const v = vehicle.value;
  const any = [v.name, v.length, v.bogie, v.width, v.margin].some((x) => x.trim());
  let vehicleParams;
  if (any) {
    const length = optional(v.length, 'Kjøretøylengde', 0.1, 100);
    const bogie = optional(v.bogie, 'Boggiavstand', 0.1, 100);
    const width = optional(v.width, 'Bredde', 0.1, 10);
    const margin = optional(v.margin || '0', 'Sideklaring', 0, 5);
    if (length === null || bogie === null || width === null || margin === null) return;
    if (length === undefined || bogie === undefined || width === undefined) {
      error.value = 'Kjøretøy: fyll ut lengde, boggiavstand og bredde (eller tøm alle feltene).';
      return;
    }
    if (bogie > length) {
      error.value = 'Boggiavstanden kan ikke være lengre enn kjøretøyet.';
      return;
    }
    vehicleParams = {
      name: v.name.trim() || 'Kjøretøy',
      lengthM: length,
      bogieCentreM: bogie,
      widthM: width,
      marginM: margin ?? 0,
    };
  }

  project.updateMeta({ name: trimmed, description: description.value.trim() || undefined });
  const dp = project.designParameters;
  if (
    clr !== dp.minVerticalClearanceM ||
    JSON.stringify(vehicleParams) !== JSON.stringify(dp.vehicle)
  ) {
    project.setDesignParameters(
      { minVerticalClearanceM: clr, vehicle: vehicleParams },
      'Endre prosjektparametre',
    );
  }
  ui.settingsOpen = false;
}
</script>

<template>
  <div v-if="ui.settingsOpen" class="backdrop" @keydown.esc="ui.settingsOpen = false">
    <form
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="set-title"
      data-testid="settings"
      @submit.prevent="apply"
    >
      <h2 id="set-title">Prosjektinnstillinger</h2>
      <label
        >Prosjektnavn
        <input v-model="name" type="text" data-testid="project-name" required autofocus
      /></label>
      <label
        >Beskrivelse <textarea v-model="description" rows="3" data-testid="project-description" />
      </label>
      <p class="muted">
        Enheter: meter. Koordinatsystem: lokalt XY (flere systemer kommer i senere fase).
      </p>

      <h3 class="overview-h">Høyder</h3>
      <label
        >Minste fri høyde for planskilt kryssing (m)
        <input
          v-model="clearance"
          type="text"
          inputmode="decimal"
          placeholder="ikke satt"
          data-testid="project-clearance"
      /></label>
      <p class="muted" style="font-size: 11px">
        Ingen standardverdi: du setter den selv ut fra kilden du bruker. Tomt = høydeforskjellen
        vises, men kryssinger vurderes ikke automatisk som planskilte.
      </p>

      <h3 class="overview-h">Kjøretøy (brukerdefinert)</h3>
      <label>Navn <input v-model="vehicle.name" type="text" data-testid="vehicle-name" /></label>
      <label
        >Lengde over kropp (m)
        <input
          v-model="vehicle.length"
          type="text"
          inputmode="decimal"
          data-testid="vehicle-length"
      /></label>
      <label
        >Avstand mellom boggisentre (m)
        <input v-model="vehicle.bogie" type="text" inputmode="decimal" data-testid="vehicle-bogie"
      /></label>
      <label
        >Bredde (m)
        <input v-model="vehicle.width" type="text" inputmode="decimal" data-testid="vehicle-width"
      /></label>
      <label
        >Ekstra sideklaring (m)
        <input
          v-model="vehicle.margin"
          type="text"
          inputmode="decimal"
          placeholder="0"
          data-testid="vehicle-margin"
      /></label>
      <p class="muted" style="font-size: 11px">
        Brukes til geometrisk kjøretøykontroll (utsving i kurver, sporavstand). Dette er
        <b>ikke</b> kjøretøyprofil eller fri profil etter regelverk.
      </p>
      <div
        v-if="error"
        role="alert"
        style="color: var(--danger); margin-bottom: 8px"
        data-testid="settings-error"
      >
        {{ error }}
      </div>
      <div class="actions">
        <button type="button" class="btn secondary" @click="ui.settingsOpen = false">Avbryt</button>
        <button type="submit" class="btn" data-testid="settings-ok">Bruk</button>
      </div>
    </form>
  </div>
</template>
