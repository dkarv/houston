// Pre-compresses the exported web app so the server can send Brotli or gzip files
// without compressing on every request. The join page's JavaScript shrinks to about a
// quarter; people on slow phone connections are in the call much sooner.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dir = process.argv[2] ?? 'dist';
const compressible = /\.(js|css|html|json|svg|map|txt|webmanifest)$/;

function* files(path) {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (compressible.test(entry) && !/\.map$/.test(entry)) yield full;
  }
}

let before = 0;
let after = 0;
for (const file of files(dir)) {
  const content = readFileSync(file);
  if (content.length < 1024) continue;
  const brotli = brotliCompressSync(content, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: content.length },
  });
  writeFileSync(`${file}.br`, brotli);
  writeFileSync(`${file}.gz`, gzipSync(content, { level: 9 }));
  before += content.length;
  after += brotli.length;
}
console.log(`Compressed ${Math.round(before / 1024)} KB to ${Math.round(after / 1024)} KB (Brotli)`);
