import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative stier: bygget kan legges i en vilkårlig mappe (også en undermappe på en webserver).
  base: './',
  plugins: [vue()],
  resolve: {
    alias: { '@fixtures': fileURLToPath(new URL('../../fixtures', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
