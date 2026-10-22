<script setup lang="ts">
import { useUiStore } from '../stores/ui';
const ui = useUiStore();
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div
      v-for="t in ui.toasts"
      :key="t.id"
      :class="['toast', t.kind]"
      :role="t.kind === 'error' ? 'alert' : 'status'"
      data-testid="toast"
    >
      {{ t.text }}
    </div>
  </div>
</template>
