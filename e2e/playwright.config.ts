import { networkInterfaces } from 'node:os';
import { defineConfig } from '@playwright/test';

const PORT = 3100;
// Set to test an already running server (e.g. the Docker image) instead of starting one.
const external = process.env.E2E_BASE_URL;

// The relay test needs an address the TURN server can advertise and both browsers reach;
// loopback is always refused as a peer, so use the first private LAN address.
const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((address) => address && address.family === 'IPv4' && !address.internal)?.address;

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    // System Chrome; set PLAYWRIGHT_CHANNEL= (empty) to use Playwright's bundled Chromium.
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--auto-select-desktop-capture-source=Entire screen',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    permissions: ['microphone', 'camera'],
  },
  webServer: external
    ? undefined
    : {
        command: 'pnpm --filter @houston/server dev',
        url: `http://localhost:${PORT}/api/health`,
        reuseExistingServer: false,
        stdout: 'ignore',
        env: {
          HOUSTON_PORT: String(PORT),
          HOUSTON_PUBLIC_URL: `http://localhost:${PORT}`,
          HOUSTON_WEB_DIR: '../app/dist',
          HOUSTON_DATA_DIR: '../../e2e/.data',
          HOUSTON_TURN_HOST: lanIp ?? '127.0.0.1',
          HOUSTON_TURN_PORT: '34800',
          HOUSTON_TURN_EXTERNAL_IP: lanIp ?? '127.0.0.1',
          HOUSTON_TURN_ALLOW_PRIVATE_PEERS: 'true',
          HOUSTON_RATE_LIMIT_PER_MINUTE: '1000',
          HOUSTON_MAIL_DIR: '../../e2e/.data/mail',
        },
      },
});
