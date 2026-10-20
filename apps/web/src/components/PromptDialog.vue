<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { parseNumber } from '../format';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
const text = ref('');
const error = ref('');
const input = ref<HTMLInputElement | null>(null);

watch(
  () => ui.prompt,
  async (p) => {
    if (!p) return;
    text.value = String(p.value);
    error.value = '';
    await nextTick();
    input.value?.focus();
    input.value?.select();
  },
);

function finish(value: number | null) {
  const p = ui.prompt;
  ui.prompt = null;
  p?.resolve(value);
}

function submit() {
  const p = ui.prompt;
  if (!p) return;
  const n = parseNumber(text.value);
  if (n === null || (p.integer && !Number.isInteger(n)) || n < p.min || n > p.max) {
    error.value = `Oppgi ${p.integer ? 'et heltall' : 'et tall'} mellom ${p.min} og ${p.max}.`;
    return;
  }
  finish(n);
}
</script>

<template>
  <div v-if="ui.prompt" class="backdrop" @keydown.esc.stop="finish(null)">
    <form
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-title"
      data-testid="prompt"
      @submit.prevent="submit"
    >
      <h2 id="prompt-title">{{ ui.prompt.title }}</h2>
      <label>
        {{ ui.prompt.label }}
        <input
          ref="input"
          v-model="text"
          type="text"
          inputmode="numeric"
          data-testid="prompt-input"
        />
      </label>
      <div v-if="error" class="err" role="alert" style="color: var(--danger)">{{ error }}</div>
      <div class="actions">
        <button
          type="button"
          class="btn secondary"
          data-testid="prompt-cancel"
          @click="finish(null)"
        >
          Avbryt
        </button>
        <button type="submit" class="btn" data-testid="prompt-ok">OK</button>
      </div>
    </form>
  </div>
</template>
