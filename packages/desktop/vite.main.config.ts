import path from 'node:path';

import { defineConfig } from 'vite';

// The main process runs the in-process Wavegrid brain (@wavegrid/server +
// @wavegrid/receiver). Those pull Node-only deps (ws, bonjour-service, fs) that
// must stay external — bundling them into the main chunk breaks their native /
// dynamic requires.
//
// Every workspace package with such a dep must be listed here, not just the ones
// whose own imports are: a bundled package's `import 'ws'` becomes a
// `require('ws')` resolved from *this* package, which pnpm never installed.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  build: {
    rollupOptions: {
      external: [
        '@wavegrid/animations',
        '@wavegrid/server',
        '@wavegrid/receiver',
        '@wavegrid/settings',
        '@wavegrid/layout',
        '@wavegrid/discovery',
        '@wavegrid/doctor',
        '@wavegrid/osc',
        'ws',
        'bonjour-service'
      ]
    }
  }
});
