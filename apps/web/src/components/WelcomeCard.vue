<script setup lang="ts">
import { computed } from 'vue';
import { useActions } from '../actions';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import { useTools } from '../tools/controller';

const project = useProjectStore();
const ui = useUiStore();
const ctrl = useTools();
const actions = useActions();

/** Vises bare i et tomt prosjekt, og forsvinner så snart noe tegnes eller importeres. */
const visible = computed(
  () => !ui.welcomeDismissed && !project.objects.length && !project.backgrounds.length,
);
</script>

<template>
  <aside v-if="visible" class="welcome" aria-label="Kom i gang" data-testid="welcome">
    <button
      class="close"
      aria-label="Skjul"
      data-testid="welcome-close"
      @click="ui.welcomeDismissed = true"
    >
      ×
    </button>
    <h2>Kom i gang</h2>
    <ul>
      <li>
        <button @click="ctrl.setTool('line')">Tegn et rett spor <kbd>L</kbd></button>
      </li>
      <li>
        <button data-testid="welcome-demo" @click="actions.openDemo()">
          Åpne eksempelprosjekt
        </button>
      </li>
      <li>
        <button data-testid="welcome-lodalen" @click="actions.openLodalenDemo()">
          Åpne avansert eksempel
        </button>
      </li>
      <li><button @click="actions.openFile()">Åpne lagret prosjekt …</button></li>
      <li>
        <button @click="actions.importBackground()">
          Importer kartunderlag (DXF, PDF, bilde) …
        </button>
      </li>
      <li>
        <button @click="actions.showHelp()">Hurtigtaster og tips <kbd>?</kbd></button>
      </li>
    </ul>
  </aside>
</template>
