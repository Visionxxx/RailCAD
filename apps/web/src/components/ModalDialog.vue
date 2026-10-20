<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
const first = ref<HTMLButtonElement | null>(null);
onMounted(() => first.value?.focus());

function confirm() {
  const d = ui.dialog;
  ui.closeDialog();
  d?.onConfirm?.();
}
</script>

<template>
  <div v-if="ui.dialog" class="backdrop" @keydown.esc="ui.closeDialog()">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" data-testid="dialog">
      <h2 id="dlg-title">{{ ui.dialog.title }}</h2>
      <ul>
        <li v-for="(l, i) in ui.dialog.lines" :key="i">{{ l }}</li>
      </ul>
      <div class="actions">
        <button ref="first" class="btn secondary" data-testid="dialog-close" @click="ui.closeDialog()">
          {{ ui.dialog.confirmLabel ? 'Avbryt' : 'Lukk' }}
        </button>
        <button v-if="ui.dialog.confirmLabel" class="btn" data-testid="dialog-confirm" @click="confirm">
          {{ ui.dialog.confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
