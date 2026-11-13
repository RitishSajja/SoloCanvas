import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBoard, saveBoard, restoreBackup, BOARD_KEY, BACKUP_KEY } from '../src/storage.mjs';
function memory(initial = null) {
 const values = new Map(initial === null ? [] : [[BOARD_KEY, initial]]);
 return {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, next) { values.set(key, next); },
 };
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
  assert.match(saveBoard({ nodes: [], edges: [] }, store), /unreadable/);
  assert.equal(store.getItem(BOARD_KEY), raw);
 }
});
test('offers an explicit restore from the last valid save when the current save is unreadable', () => {
 const store = memory();
 const previous = { nodes: [{ id: 'a', position: { x: 2, y: 3 }, data: { label: 'API' } }], edges: [] };
 assert.equal(saveBoard(previous, store), 'Saved on this device');
 assert.equal(saveBoard({ nodes: [], edges: [] }, store), 'Saved on this device');
 assert.equal(store.getItem(BACKUP_KEY), JSON.stringify(previous));
 store.setItem(BOARD_KEY, '{broken');
 const result = loadBoard(store);
 assert.deepEqual(result.board, previous);
 assert.equal(result.canSave, false);
 assert.equal(result.canRestoreBackup, true);
 assert.equal(store.getItem(BOARD_KEY), '{broken');
 const restored = restoreBackup(store);
 assert.equal(restored.success, true);
 assert.deepEqual(loadBoard(store).board, previous);
 assert.equal(loadBoard(store).canSave, true);
});
test('does not restore an invalid backup over unreadable saved data', () => {
 const store = memory('{broken');
 store.setItem(BACKUP_KEY, '{"nodes":[null],"edges":[]}');
 const result = restoreBackup(store);
 assert.equal(result.success, false);
 assert.equal(store.getItem(BOARD_KEY), '{broken');
});
test('does not restore a stale backup over a board repaired elsewhere', () => {
 const store = memory('{broken');
 store.setItem(BACKUP_KEY, '{"nodes":[],"edges":[]}');
 store.setItem(BOARD_KEY, '{"nodes":[],"edges":[{"id":"new","source":"a","target":"b"}]}');
 const result = restoreBackup(store);
 assert.equal(result.success, false);
 assert.equal(store.getItem(BOARD_KEY), '{"nodes":[],"edges":[{"id":"new","source":"a","target":"b"}]}');
});
test('reports unavailable storage and failed writes', () => {
 const store = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
 assert.equal(loadBoard(store).canSave, false);
 assert.match(saveBoard({ nodes: [], edges: [] }, store), /Could not save/);
 assert.equal(restoreBackup(store).success, false);
});
