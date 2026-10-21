<script setup lang="ts">
import { isTypingTarget } from './dom';
import { onBeforeUnmount, onMounted, watchEffect } from 'vue';
import { useActions } from './actions';
import { useAutosave } from './io/autosave';
import MenuBar from './components/MenuBar.vue';
import ModalDialog from './components/ModalDialog.vue';
import PromptDialog from './components/PromptDialog.vue';
import TurnoutEditor from './components/TurnoutEditor.vue';
import ProjectSettings from './components/ProjectSettings.vue';
import WelcomeCard from './components/WelcomeCard.vue';
import SidePanel from './components/SidePanel.vue';
import StatusBar from './components/StatusBar.vue';
import ToastList from './components/ToastList.vue';
import ToolBar from './components/ToolBar.vue';
import ViewportCanvas from './components/ViewportCanvas.vue';
import { useProjectStore } from './stores/project';
import { useUiStore } from './stores/ui';
import { useViewStore } from './stores/view';
import { TOOL_SHORTCUTS, useTools } from './tools/controller';
import type { ToolId } from './tools/types';

const project = useProjectStore();
const view = useViewStore();
const ui = useUiStore();
const ctrl = useTools();
const actions = useActions();
const autosave = useAutosave();

watchEffect(() => {
  document.documentElement.dataset.theme = view.theme;
});

const byShortcut = new Map(
  (Object.entries(TOOL_SHORTCUTS) as Array<[ToolId, string]>)
    .filter(([, key]) => key !== '')
    .map(([id, key]) => [key.toLowerCase(), id]),
);

function onKeyDown(e: KeyboardEvent) {
  if (ui.dialog || ui.settingsOpen || ui.turnoutEditorOpen) return; // dialoger håndterer sine egne taster
  if (isTypingTarget(e)) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();

  if (mod && k === 'z') {
    e.preventDefault();
    if (e.shiftKey) project.redo();
    else project.undo();
  } else if (mod && k === 'y') {
    e.preventDefault();
    project.redo();
  } else if (mod && k === 'c') {
    e.preventDefault();
    actions.copy();
  } else if (mod && k === 'v') {
    e.preventDefault();
    actions.paste();
  } else if (mod && k === 'd') {
    e.preventDefault(); // nettleserens «bokmerk siden»
    actions.duplicate();
  } else if (mod && k === 's') {
    e.preventDefault();
    actions.save();
  } else if (mod && k === 'o') {
    e.preventDefault();
    actions.openFile();
  } else if (mod || e.altKey) {
    return;
  } else if (e.key === 'Escape') {
    ctrl.escape();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    project.deleteSelection();
  } else if (e.key === 'Enter') {
    if (ctrl.key({ key: 'Enter', shift: e.shiftKey, ctrl: false })) e.preventDefault();
  } else if (e.key === '?') {
    actions.showHelp();
  } else if (k === 'f') {
    view.fitAll();
  } else if (byShortcut.has(k) && !e.repeat) {
    ctrl.setTool(byShortcut.get(k) as ToolId);
  }
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (project.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
}

onMounted(() => {
  autosave.start();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<template>
  <div class="app">
    <MenuBar />
    <ToolBar />
    <main class="canvas-area">
      <ViewportCanvas />
      <WelcomeCard />
    </main>
    <SidePanel />
    <StatusBar />
    <ToastList />
    <ModalDialog />
    <ProjectSettings />
    <TurnoutEditor />
    <PromptDialog />
  </div>
</template>
