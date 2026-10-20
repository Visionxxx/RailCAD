<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fmt, parseNumber } from '../format';

const props = withDefaults(
  defineProps<{
    id: string;
    label: string;
    modelValue: number;
    decimals?: number;
    unit?: string;
    /** Returnerer feilmelding, eller null hvis verdien er gyldig. */
    validate?: (n: number) => string | null;
  }>(),
  { decimals: 3, unit: '', validate: undefined },
);
const emit = defineEmits<{ commit: [value: number] }>();

const shown = computed(() => fmt(props.modelValue, props.decimals));
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

function revert() {
  text.value = shown.value;
  error.value = '';
}
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}<template v-if="unit"> ({{ unit }})</template></label>
    <input
      :id="id"
      v-model="text"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      :data-testid="id"
      :aria-invalid="error ? 'true' : 'false'"
      :aria-describedby="error ? `${id}-err` : undefined"
      @keydown.enter.prevent="commit"
      @keydown.esc.stop.prevent="revert"
      @blur="commit"
    />
    <div v-if="error" :id="`${id}-err`" class="err" role="alert">{{ error }}</div>
  </div>
</template>
