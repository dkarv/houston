// Bundles the server and the TURN worker including all dependencies, so the Docker
// image needs nothing but Node and the two output files.
import { build } from 'esbuild';

await build({
  entryPoints: {
    main: 'src/main.ts',
    'turn-worker': '../../packages/turn/src/worker.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  // Some CommonJS dependencies call require() at runtime, which ESM output lacks.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
