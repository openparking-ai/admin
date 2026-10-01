import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the built site works from any folder a garage
  // serves it from.
  base: './',
  build: {
    // Fonts stay files beside the page instead of being inlined as data.
    assetsInlineLimit: 0,
  },
});
