import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Capacitor loads the built web assets from `dist/`. Keep the output relative so
// it resolves under the native `capacitor://` / `https://localhost` schemes.
export default defineConfig({
  plugins: [svelte()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
  },
  server: {
    port: 5173,
    host: true,
  },
});
