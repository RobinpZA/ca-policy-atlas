import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import pkg from './package.json' with { type: 'json' };

// CI sets GITHUB_SHA; a local build carries the version alone.
const sha = process.env.GITHUB_SHA?.slice(0, 7);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(sha ? `${pkg.version}+${sha}` : pkg.version),
  },
  // Relative base so the built app works from a subpath (GitHub Pages) or a file:// open.
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
  },
});
