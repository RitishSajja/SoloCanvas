import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBoard, saveBoard, saveBoardSafely, restoreBackup, restoreBackupSafely, parseBoard, BOARD_KEY, BACKUP_KEY, WORKSPACE_KEY, WORKSPACE_LOCK } from '../src/storage.mjs';
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

test('rejects an overwrite when another tab changed the saved board', () => {
 const store = memory();
 const initial = loadBoard(store);
 const newer = { nodes: [{ id: 'new', position: { x: 1, y: 2 }, data: {} }], edges: [] };
 assert.equal(saveBoard(newer, store), 'Saved on this device');
 const newerRaw = store.getItem(BOARD_KEY);
 assert.match(saveBoard({ nodes: [], edges: [] }, store, initial.raw), /changed in another tab/);
 assert.equal(store.getItem(BOARD_KEY), newerRaw);
});
test('allows repeat saves with a refreshed expected version', () => {
 const store = memory();
 const first = { nodes: [], edges: [] };
 const initial = loadBoard(store);
 assert.equal(saveBoard(first, store, initial.raw), 'Saved on this device');
 const snapshot = store.getItem(BOARD_KEY);
 assert.equal(saveBoard(first, store, snapshot), 'Saved on this device');
});
test('restoring a backup supplies the saved version for the next save', () => {
 const store = memory('{broken');
 const backup = '{"nodes":[],"edges":[]}';
 store.setItem(BACKUP_KEY, backup);
 const restored = restoreBackup(store);
 assert.equal(restored.raw, backup);
 assert.deepEqual(restored.board, { nodes: [], edges: [] });
 assert.equal(saveBoard({ nodes: [], edges: [] }, store, restored.raw), 'Saved on this device');
});
test('restore returns the backup currently stored, not the previously loaded backup', () => {
 const store = memory('{broken');
 store.setItem(BACKUP_KEY, '{"nodes":[{"id":"old","position":{"x":0,"y":0},"data":{}}],"edges":[]}');
 const newerBackup = { nodes: [{ id: 'new', position: { x: 1, y: 2 }, data: {} }], edges: [] };
 store.setItem(BACKUP_KEY, JSON.stringify(newerBackup));
 const restored = restoreBackup(store);
 assert.deepEqual(restored.board, newerBackup);
 assert.equal(store.getItem(BOARD_KEY), JSON.stringify(newerBackup));
});

test('valid exported board can be parsed for import', () => {
 const board = { nodes: [{ id: 'a', position: { x: 2, y: 3 }, data: { label: 'API' } }], edges: [] };
 assert.deepEqual(parseBoard(JSON.stringify(board)), board);
});
test('invalid import leaves parsing rejected', () => {
 for (const raw of ['not json', '{}', '{"nodes":[null],"edges":[]}', '{"nodes":[],"edges":[{}]}']) assert.equal(parseBoard(raw), null);
});

test('v1 opens read-only when a newer workspace exists', () => {
 const raw = JSON.stringify({ nodes: [{ id: 'n', position: { x: 1, y: 2 }, data: { label: 'legacy' } }], edges: [] });
 const store = memory(raw); store.setItem(WORKSPACE_KEY, '{unsupported or damaged');
 const result = loadBoard(store);
 assert.equal(result.canSave, false); assert.equal(result.canRestoreBackup, false);
 assert.equal(result.board.nodes[0].data.label, 'legacy');
 assert.match(result.message, /read-only/);
 assert.equal(store.getItem(BOARD_KEY), raw);
});
test('v1 save and restore refuse to overwrite after a newer workspace appears', () => {
 const store = memory(); const opened = loadBoard(store);
 store.setItem(WORKSPACE_KEY, '{"version":2}');
 assert.match(saveBoard({ nodes: [], edges: [] }, store, opened.raw), /newer workspace/);
 assert.equal(store.getItem(BOARD_KEY), null);
 store.setItem(BOARD_KEY, '{broken');
 store.setItem(BACKUP_KEY, '{"nodes":[],"edges":[]}');
 assert.equal(restoreBackup(store).success, false);
 assert.equal(store.getItem(BOARD_KEY), '{broken');
});

test('v1 saves use the same lock as v2, with a safe legacy fallback', async () => {
 const store = memory(); const opened = loadBoard(store);
 const locks = { request(name, options, callback) {
   assert.equal(name, WORKSPACE_LOCK); assert.equal(options.mode, 'exclusive'); return Promise.resolve(callback());
 } };
 assert.equal(await saveBoardSafely({ nodes: [], edges: [] }, store, opened.raw, locks), 'Saved on this device');
 const next = loadBoard(store);
 assert.equal(await saveBoardSafely({ nodes: [], edges: [] }, store, next.raw, null), 'Saved on this device');
});
test('failed locks cannot write or restore the board', async () => {
 const store = memory('{broken'); store.setItem(BACKUP_KEY, '{"nodes":[],"edges":[]}');
 const locks = { request() { return Promise.reject(new Error('denied')); } };
 assert.match(await saveBoardSafely({ nodes: [], edges: [] }, store, '{broken', locks), /lock/);
 assert.equal((await restoreBackupSafely(store, locks)).success, false);
 assert.equal(store.getItem(BOARD_KEY), '{broken');
});
