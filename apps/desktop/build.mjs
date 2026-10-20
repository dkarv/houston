// Bundles the Electron main process and preload script. Electron and the native input
// module stay external; everything else, including @houston/protocol, is inlined.
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  // x11 and usocket are optional dbus-next transports we never use.
  external: ['electron', '@jitsi/robotjs', 'x11', 'usocket'],
  logLevel: 'info',
};

await Promise.all([
  build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.js' }),
  // Preloads run sandboxed: a single file without node_modules access.
  build({ ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.js' }),
  build({ ...common, entryPoints: ['src/overlay-preload.ts'], outfile: 'dist/overlay-preload.js' }),
]);
