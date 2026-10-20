import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Toast {
  id: number;
  kind: 'info' | 'error';
  text: string;
}

export interface DialogState {
  title: string;
  lines: string[];
  /** Hvis satt vises en bekreftelsesknapp i tillegg til «Lukk». */
  confirmLabel?: string;
  onConfirm?: () => void;
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([]);
  const dialog = ref<DialogState | null>(null);
  const settingsOpen = ref(false);
  let counter = 0;

  function notify(text: string, kind: Toast['kind'] = 'info') {
    const id = ++counter;
    toasts.value = [...toasts.value, { id, kind, text }].slice(-4);
    setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }
  function showDialog(d: DialogState) {
    dialog.value = d;
  }
  function closeDialog() {
    dialog.value = null;
  }

  return { toasts, dialog, settingsOpen, notify, dismiss, showDialog, closeDialog };
});
