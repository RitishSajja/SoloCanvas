import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBoard, saveBoard, BOARD_KEY } from '../src/storage.mjs';
function memory(initial = null) {
 let value = initial;
 return { getItem(key) { assert.equal(key, BOARD_KEY); return value; }, setItem(key, next) { assert.equal(key, BOARD_KEY); value = next; } };
}
test('saves and reloads nodes and labeled edges', () => {
 const store = memory();
 const board = { nodes: [{ id: 'a', position: { x: 2, y: 3 }, data: { label: 'API' } }], edges: [{ id: 'e', source: 'a', target: 'a', label: 'calls' }] };
 assert.equal(saveBoard(board, store), 'Saved on this device');
 assert.deepEqual(loadBoard(store).board, board);
});
test('new storage opens an editable empty board', () => {
 const result = loadBoard(memory());
 assert.equal(result.canSave, true); assert.deepEqual(result.board, { nodes: [], edges: [] });
});
test('corrupt or malformed data disables save without replacing the stored value', () => {
 for (const raw of ['{', '{"nodes":[null],"edges":[]}', '{"nodes":[],"edges":[{}]}']) {
  const store = memory(raw); const result = loadBoard(store);
  assert.equal(result.canSave, false); assert.equal(store.getItem(BOARD_KEY), raw);
 }
});
test('reports unavailable storage and failed writes', () => {
 const store = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
 assert.equal(loadBoard(store).canSave, false);
 assert.match(saveBoard({ nodes: [], edges: [] }, store), /Could not save/);
});
