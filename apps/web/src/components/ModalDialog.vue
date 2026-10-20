<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
const root = ref<HTMLElement | null>(null);
let returnFocusTo: HTMLElement | null = null;

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Flytt fokus inn når dialogen åpnes, og tilbake dit brukeren var når den lukkes.
watch(
  () => ui.dialog,
  async (d, old) => {
    if (d && !old) {
      returnFocusTo = document.activeElement as HTMLElement | null;
      await nextTick();
      root.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    } else if (!d && old) {
      returnFocusTo?.focus?.({ preventScroll: true });
      returnFocusTo = null;
    }
  },
);

function confirm() {
  const d = ui.dialog;
  ui.closeDialog();
  d?.onConfirm?.();
}
function cancel() {
  const d = ui.dialog;
  ui.closeDialog();
  d?.onCancel?.();
}

/** Tab holder seg innenfor dialogen. */
function trap(e: KeyboardEvent) {
  const items = [...(root.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
  if (!items.length) return;
  const first = items[0] as HTMLElement;
  const last = items[items.length - 1] as HTMLElement;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div v-if="ui.dialog" class="backdrop" @keydown.esc.stop="cancel" @keydown.tab="trap">
    <div
      ref="root"
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dlg-title"
      data-testid="dialog"
    >
      <h2 id="dlg-title">{{ ui.dialog.title }}</h2>
      <ul>
        <li v-for="(l, i) in ui.dialog.lines" :key="i">{{ l }}</li>
      </ul>
      <div class="actions">
        <button class="btn secondary" data-testid="dialog-close" @click="cancel">
          {{ ui.dialog.cancelLabel ?? (ui.dialog.confirmLabel ? 'Avbryt' : 'Lukk') }}
        </button>
        <button
          v-if="ui.dialog.confirmLabel"
          class="btn"
          data-testid="dialog-confirm"
          @click="confirm"
        >
          {{ ui.dialog.confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
