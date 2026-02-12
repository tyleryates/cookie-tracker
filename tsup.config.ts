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
  // Preload — CJS, runs in isolated preload context with access to electron APIs
  {
    name: 'preload',
    entry: { preload: 'src/preload.ts' },
    format: ['cjs'],
    platform: 'node',
    target: 'node20',
    outDir: 'dist',
    external: [/^[^./]/],
  },
  // Renderer — CJS bundle (inlines preact + local code), pure browser JS
  {
    name: 'renderer',
    entry: { renderer: 'src/renderer.ts' },
    format: ['cjs'],
    platform: 'node',
    outDir: 'dist',
    external: ['electron'],
    noExternal: [/preact/],
    esbuildOptions(options) {
      options.jsx = 'automatic';
      options.jsxImportSource = 'preact';
      options.define = { 'process.env.NODE_ENV': '"production"' };
    },
  },
]);
