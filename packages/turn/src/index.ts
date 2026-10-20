import { Worker } from 'node:worker_threads';
import type { TurnServerOptions, TurnWorkerMessage } from './types';

export { createTurnCredentials, type TurnCredentials } from './credentials';
export type { TurnServerOptions, TurnWorkerMessage } from './types';

export interface TurnServerHandle {
  stop(): Promise<void>;
}

// From source (dev, tests) the worker is a sibling .ts file; in the production bundle
// esbuild emits it as turn-worker.js next to the main bundle.
const workerUrl = import.meta.url.endsWith('.ts')
  ? new URL('./worker.ts', import.meta.url)
  : new URL('./turn-worker.js', import.meta.url);

/**
 * Runs the TURN server in its own worker thread, so relayed media never competes with
 * signaling and the API for the main event loop.
 */
export function startTurnServer(
  options: TurnServerOptions,
  onMessage: (message: TurnWorkerMessage) => void = () => {},
): Promise<TurnServerHandle> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { workerData: options });
    let started = false;

    const handle: TurnServerHandle = {
      stop: () =>
        new Promise((done) => {
          worker.once('exit', () => done());
          worker.postMessage({ type: 'stop' });
        }),
    };

    worker.on('message', (message: TurnWorkerMessage) => {
      onMessage(message);
      if (!started && message.type === 'listening') {
        started = true;
        resolve(handle);
      }
      if (!started && message.type === 'error') reject(new Error(message.message));
    });
    worker.once('error', (err) => {
      if (!started) reject(err);
      else onMessage({ type: 'error', message: err.message });
    });
    worker.once('exit', (code) => {
      if (!started) reject(new Error(`TURN worker exited with code ${code}`));
    });
  });
}
