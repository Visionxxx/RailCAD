<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fmt, parseNumber } from '../format';

const props = withDefaults(
  defineProps<{
    id: string;
    label: string;
    modelValue: number | null;
    decimals?: number;
    unit?: string;
    disabled?: boolean;
    /** Tomt felt er gyldig og betyr «ukjent/ikke satt» (sender `clear`). */
    nullable?: boolean;
    /** Returnerer feilmelding, eller null hvis verdien er gyldig. */
    validate?: (n: number) => string | null;
  }>(),
  { decimals: 3, unit: '', validate: undefined, disabled: false, nullable: false },
);
const emit = defineEmits<{ commit: [value: number]; clear: [] }>();

const shown = computed(() =>
  props.modelValue === null ? '' : fmt(props.modelValue, props.decimals),
);
const text = ref(shown.value);
const error = ref('');

watch(shown, (v) => {
  text.value = v;
  error.value = '';
});

function commit() {
  // Uendret tekst = ingen endring (unngår å avrunde den lagrede verdien ved å bare tabbe forbi).
  if (text.value === shown.value) {
    error.value = '';
    return;
  }
  if (props.nullable && text.value.trim() === '') {
    error.value = '';
    emit('clear');
    return;
  }
  const n = parseNumber(text.value);
  if (n === null) {
    error.value = 'Ugyldig tall. Bruk f.eks. 12,5.';
    return;
  }
  const problem = props.validate?.(n) ?? null;
  if (problem) {
    error.value = problem;
    return;
  }
  error.value = '';
  emit('commit', n);
}

/** Pil opp/ned justerer verdien: 1 (Skift ×10, Alt ×0,1). Bruker feltets egen enhet. */
function nudge(e: KeyboardEvent) {
  const dir = e.key === 'ArrowUp' ? 1 : -1;
  const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
  const current = parseNumber(text.value) ?? props.modelValue ?? 0;
  const next = Math.round((current + dir * step) * 1e9) / 1e9;
  text.value = fmt(next, props.decimals);
  commit();
}

function revert() {
  text.value = shown.value;
  error.value = '';
}
</script>

<template>
  <div class="field">
    <label :for="id"
      >{{ label }}<template v-if="unit"> ({{ unit }})</template></label
    >
    <input
      :id="id"
      v-model="text"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      :data-testid="id"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : 'false'"
      :aria-describedby="error ? `${id}-err` : undefined"
      @keydown.enter.prevent="commit"
      @keydown.up.prevent="nudge"
      @keydown.down.prevent="nudge"
      @keydown.esc.stop.prevent="revert"
      @blur="commit"
    />
    <div v-if="error" :id="`${id}-err`" class="err" role="alert">{{ error }}</div>
  </div>
</template>
