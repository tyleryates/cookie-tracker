import { defineConfig } from 'tsup';

export default defineConfig([
  // Main process — CJS, all packages external (electron-builder packages node_modules)
  {
    name: 'main',
    entry: { main: 'src/main.ts' },
    format: ['cjs'],
    platform: 'node',
    target: 'node20',
    outDir: 'dist',
    external: [/^[^./]/],
    clean: true,
    onSuccess: 'cp src/index.html src/styles.css dist/ && cp -r src/styles dist/',
  },
  // Renderer — CJS bundle (inlines preact + local code), electron external
  // Loaded via <script> tag with module.exports polyfill (nodeIntegration: true)
  {
    name: 'renderer',
    entry: { renderer: 'src/renderer.ts' },
    format: ['cjs'],
    platform: 'node',
    outDir: 'dist',
    external: ['electron'],
    esbuildOptions(options) {
      options.jsx = 'automatic';
      options.jsxImportSource = 'preact';
    },
  },
]);
