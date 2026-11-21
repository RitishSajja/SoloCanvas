import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const assetPaths = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]);

assert.ok(assetPaths.some((path) => path.endsWith('.js')), 'expected a JavaScript asset');
assert.ok(assetPaths.some((path) => path.endsWith('.css')), 'expected a CSS asset');
assert.ok(
  assetPaths.every((path) => path.startsWith('/SoloCanvas/assets/')),
  `expected all built asset paths to start with /SoloCanvas/assets/, got: ${assetPaths.join(', ')}`,
);
