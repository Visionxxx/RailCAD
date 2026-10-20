<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useActions } from '../actions';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import { useViewStore } from '../stores/view';

const project = useProjectStore();
const view = useViewStore();
const ui = useUiStore();
const actions = useActions();

interface Item {
  label: string;
  kbd?: string;
  run?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  testid?: string;
}
interface MenuDef {
  id: string;
  label: string;
  items: Item[];
}

const menus = computed<MenuDef[]>(() => [
  {
    id: 'file',
    label: 'Fil',
    items: [
      { label: 'Nytt prosjekt', run: actions.newProject, testid: 'menu-new' },
      { label: 'Åpne …', kbd: 'Ctrl+O', run: actions.openFile, testid: 'menu-open' },
      { label: 'Åpne eksempelprosjekt', run: actions.openDemo, testid: 'menu-demo' },
      {
        label: 'Åpne avansert eksempel (Lodalen-inspirert)',
        run: actions.openLodalenDemo,
        testid: 'menu-demo-lodalen',
      },
      { label: 'Lagre', kbd: 'Ctrl+S', run: actions.save, testid: 'menu-save' },
      { label: '', separator: true },
      {
        label: 'Importer bakgrunn (DXF, PDF, bilde) …',
        run: actions.importBackground,
        testid: 'menu-import-background',
      },
      {
        label: 'Eksporter DXF (R2007) …',
        run: () => actions.exportDxfFile('R2007'),
        disabled: !project.objects.length,
        testid: 'menu-export-dxf-r2007',
      },
      {
        label: 'Eksporter DXF (R12, maks. kompatibilitet) …',
        run: () => actions.exportDxfFile('R12'),
        disabled: !project.objects.length,
        testid: 'menu-export-dxf-r12',
      },
      { label: '', separator: true },
      {
        label: 'Prosjektinnstillinger …',
        run: () => (ui.settingsOpen = true),
        testid: 'menu-settings',
      },
    ],
  },
  {
    id: 'edit',
    label: 'Rediger',
    items: [
      {
        label: project.canUndo ? `Angre ${project.lastUndoLabel.toLowerCase()}` : 'Angre',
        kbd: 'Ctrl+Z',
        run: project.undo,
        disabled: !project.canUndo,
        testid: 'menu-undo',
      },
      {
        label: project.canRedo ? `Gjør om ${project.lastRedoLabel.toLowerCase()}` : 'Gjør om',
        kbd: 'Ctrl+Y',
        run: project.redo,
        disabled: !project.canRedo,
        testid: 'menu-redo',
      },
      { label: '', separator: true },
      {
        label: 'Slett valgte',
        kbd: 'Del',
        run: () => project.deleteSelection(),
        disabled: !project.selection.length,
        testid: 'menu-delete',
      },
    ],
  },
  {
    id: 'view',
    label: 'Visning',
    items: [
      { label: 'Tilpass visning', kbd: 'F', run: view.fitAll, testid: 'menu-fit' },
      { label: 'Rutenett', checked: view.showGrid, run: () => (view.showGrid = !view.showGrid) },
      {
        label: 'Skjematisk skinne-/svillevisning',
        checked: view.railView,
        run: () => (view.railView = !view.railView),
        testid: 'menu-rails',
      },
      {
        label: view.theme === 'dark' ? 'Lyst tema' : 'Mørkt tema',
        run: () => view.setTheme(view.theme === 'dark' ? 'light' : 'dark'),
        testid: 'menu-theme',
      },
    ],
  },
]);

const open = ref<string | null>(null);
const root = ref<HTMLElement | null>(null);

function onOutside(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = null;
}
onMounted(() => window.addEventListener('pointerdown', onOutside));
onBeforeUnmount(() => window.removeEventListener('pointerdown', onOutside));

function choose(item: Item) {
  if (item.disabled) return;
  open.value = null;
  item.run?.();
}
</script>

<template>
  <header ref="root" class="menubar" role="menubar" @keydown.esc="open = null">
    <span class="brand">RailCAD</span>
    <div v-for="m in menus" :key="m.id" class="menu">
      <button
        role="menuitem"
        aria-haspopup="menu"
        :aria-expanded="open === m.id"
        :data-testid="`menu-${m.id}`"
        @click="open = open === m.id ? null : m.id"
        @mouseenter="open && (open = m.id)"
      >
        {{ m.label }}
      </button>
      <div v-if="open === m.id" class="menu-list" role="menu">
        <template v-for="(it, i) in m.items" :key="i">
          <hr v-if="it.separator" />
          <button
            v-else
            role="menuitem"
            :disabled="it.disabled"
            :data-testid="it.testid"
            @click="choose(it)"
          >
            <span
              >{{ it.checked !== undefined ? (it.checked ? '✓ ' : '\u2003') : ''
              }}{{ it.label }}</span
            >
            <span class="kbd">{{ it.kbd }}</span>
          </button>
        </template>
      </div>
    </div>
    <span class="spacer" />
    <span class="project-title" data-testid="project-title">
      <b>{{ project.meta.name }}</b
      ><span v-if="project.dirty" title="Ulagrede endringer"> •</span>
    </span>
  </header>
</template>
