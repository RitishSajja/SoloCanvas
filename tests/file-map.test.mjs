import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFileMap, validateFilePaths } from '../src/file-map.mjs';

const initial = { version: 2, cards: [{ id: 'old', data: { label: 'Existing' } }], boards: [
  { id: 'original', title: 'Original', extra: {}, nodes: [{ id: 'old-node', cardId: 'old', position: { x: 1, y: 2 } }], edges: [] },
] };

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
