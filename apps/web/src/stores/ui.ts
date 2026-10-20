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
  /** Tekst på lukkeknappen (standard: «Avbryt» med bekreftelse, ellers «Lukk»). */
  cancelLabel?: string;
  /** Kalles når dialogen lukkes uten bekreftelse (knapp eller Esc). */
  onCancel?: () => void;
}

export type SideTab = 'properties' | 'objects' | 'connections' | 'backgrounds';
const SIDE_TABS: readonly SideTab[] = ['properties', 'objects', 'connections', 'backgrounds'];

function loadSideTab(): SideTab {
  try {
    const v = localStorage.getItem('railcad.sideTab');
    return SIDE_TABS.includes(v as SideTab) ? (v as SideTab) : 'properties';
  } catch {
    return 'properties';
  }
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([]);
  const dialog = ref<DialogState | null>(null);
  const settingsOpen = ref(false);
  /** Skjult «Kom i gang»-kort (gjelder økten). */
  const welcomeDismissed = ref(false);
  /** Aktiv fane i høyre panel. Huskes mellom økter (kun en bekvemmelighet). */
  const sideTab = ref<SideTab>(loadSideTab());
  function showTab(tab: SideTab) {
    sideTab.value = tab;
    try {
      localStorage.setItem('railcad.sideTab', tab);
    } catch {
      /* lagring kan være blokkert – fanen gjelder da kun for økten */
    }
  }
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

  return {
    toasts,
    dialog,
    settingsOpen,
    welcomeDismissed,
    sideTab,
    showTab,
    notify,
    dismiss,
    showDialog,
    closeDialog,
  };
});
