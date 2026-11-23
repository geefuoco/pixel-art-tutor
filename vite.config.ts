import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base so the build works from the GitHub Pages project subpath.
// Routing is hash-based, so no server rewrites are needed for deep links.
export default defineConfig({
  base: './',
  plugins: [react()],
});
