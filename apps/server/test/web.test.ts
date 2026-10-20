import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type TestServer } from './helpers';

let server: TestServer;
const script = `console.log("${'houston '.repeat(500)}")`;

beforeAll(async () => {
  const web = mkdtempSync(join(tmpdir(), 'houston-web-'));
  writeFileSync(
    join(web, 'index.html'),
    '<html><head><title>Houston</title></head><body></body></html>',
  );
  mkdirSync(join(web, '_expo/static/js'), { recursive: true });
  writeFileSync(join(web, '_expo/static/js/entry-abc.js'), script);
  writeFileSync(join(web, '_expo/static/js/entry-abc.js.br'), brotliCompressSync(script));
  server = await startServer({ HOUSTON_WEB_DIR: web });
});
afterAll(() => server.app.close());

describe('web app', () => {
  it('serves the app for client-side routes, with the manifest in the head', async () => {
    for (const path of ['/', '/j/123456']) {
      const response = await fetch(`http://${server.base}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(await response.text()).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    }
  });

  it('sends pre-compressed, immutable scripts', async () => {
    const response = await fetch(`http://${server.base}/_expo/static/js/entry-abc.js`, {
      headers: { 'accept-encoding': 'br' },
    });
    expect(response.headers.get('content-encoding')).toBe('br');
    expect(response.headers.get('cache-control')).toContain('immutable');
    // fetch decodes it again: same content.
    expect(await response.text()).toBe(script);
  });

  it('still answers unknown API paths with JSON', async () => {
    const response = await fetch(`http://${server.base}/api/nope`);
    expect(response.status).toBe(404);
  });
});
