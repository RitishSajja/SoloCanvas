import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFileMap, validateFilePaths, partitionSelectedFiles, readSelectedSources, MAX_SOURCE_FILE_BYTES, MAX_SOURCE_TOTAL_BYTES } from '../src/file-map.mjs';
import { migrateWorkspaceV2 } from '../src/workspace.mjs';

const initial = migrateWorkspaceV2({ version: 2, cards: [{ id: 'old', data: { label: 'Existing' } }], boards: [
  { id: 'original', title: 'Original', extra: {}, nodes: [{ id: 'old-node', cardId: 'old', position: { x: 1, y: 2 } }], edges: [] },
] });

test('selected filenames become a new board without altering existing work', () => {
  const saved = structuredClone(initial); let id = 0;
  const result = createFileMap(initial, 'map', '  Files  ', ['repo/src/main.ts', 'repo/README.md'], () => 'generated-' + ++id);
  assert.deepEqual(initial, saved);
  assert.deepEqual(result.boards[0], initial.boards[0]);
  assert.equal(result.boards[1].title, 'Files');
  assert.equal(result.boards[1].nodes.length, 2);
  assert.deepEqual(result.cards.slice(1).map(card => card.data.path).sort(), ['repo/README.md', 'repo/src/main.ts'].sort());
  assert.equal(result.boards[1].edges.length, 0);
  assert.deepEqual(Object.keys(result.cards[1].data).sort(), ['kind', 'label', 'path']);
});

test('rejects ambiguous, unsafe or excessive file selections without mutation', () => {
  const original = structuredClone(initial);
  for (const paths of [[], ['a', 'a'], ['/abs'], ['a/../b'], ['a//b'], ['a\\b'], ['bad\nname'], Array.from({ length: 101 }, (_, i) => 'file' + i)]) {
    assert.throws(() => validateFilePaths(paths));
  }
  assert.throws(() => createFileMap(initial, 'original', 'Map', ['a'], () => 'new'));
  assert.throws(() => createFileMap(initial, 'map', 'Map', ['a', 'b'], () => 'duplicate'));
  assert.deepEqual(initial, original);
});

test('source reading is bounded and reports unsupported, invalid or oversized files', async () => {
 const file = bytes => ({ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
 const text = value => file(new TextEncoder().encode(value));
 const tooLarge = { size: MAX_SOURCE_FILE_BYTES + 1, arrayBuffer() { throw new Error('must not read'); } };
 const unread = { size: 1, arrayBuffer() { throw new Error('must not read'); } };
 const entries = [
   { path: 'src/main.ts', file: text('export const x = 1;') },
   { path: '.env', file: unread },
   { path: 'big.py', file: tooLarge },
   { path: 'bad.js', file: file(Uint8Array.from([255])) },
   { path: 'null.ts', file: file(Uint8Array.from([0])) },
 ];
 const { contents, skipped } = await readSelectedSources(entries);
 assert.deepEqual([...contents], [['src/main.ts', 'export const x = 1;']]);
 assert.deepEqual(skipped.map(item => item.path), ['.env', 'big.py', 'bad.js', 'null.ts']);
 let id = 0;
 const output = createFileMap(initial, 'mapped', 'Map', entries.map(entry => entry.path), () => 'id-' + ++id, contents);
 assert.equal(output.cards.find(card => card.data.path === 'src/main.ts').data.sourceText, 'export const x = 1;');
 assert.equal(output.cards.find(card => card.data.path === '.env').data.sourceText, undefined);
 assert.throws(() => createFileMap(initial, 'map', 'Map', ['a'], () => 'x', new Map([['other', 'text']])));
});

test('total imported source has a strict byte limit', async () => {
 const bytes = new Uint8Array(MAX_SOURCE_FILE_BYTES).fill(65);
 let reads = 0;
 const entries = Array.from({ length: MAX_SOURCE_TOTAL_BYTES / MAX_SOURCE_FILE_BYTES + 1 }, (_, i) => ({
   path: 'file' + i + '.js', file: { size: bytes.length, async arrayBuffer() { reads++; return bytes.buffer; } },
 }));
 const result = await readSelectedSources(entries);
 assert.equal(reads, MAX_SOURCE_TOTAL_BYTES / MAX_SOURCE_FILE_BYTES);
 assert.equal(result.skipped.at(-1).reason, 'total exceeds 512 KiB');
});

test('folder filtering skips generated subdirectories but respects the selected root and individual files', () => {
 const root = { name: 'root.ts', webkitRelativePath: 'build/root.ts' };
 const source = { name: 'app.ts', webkitRelativePath: 'project/src/app.ts' };
 const generated = { name: 'dep.js', webkitRelativePath: 'project/node_modules/pkg/dep.js' };
 const git = { name: 'config', webkitRelativePath: 'project/.git/config' };
 const individual = { name: 'dep.js', webkitRelativePath: '' };
 const files = [root, source, generated, git, individual];
 const result = partitionSelectedFiles(files);
 assert.deepEqual(result.retained, [root, source, individual]);
 assert.deepEqual(result.ignored, [generated, git]);
 assert.deepEqual(partitionSelectedFiles(files, false).retained, files);
 assert.deepEqual(files, [root, source, generated, git, individual]);
});
