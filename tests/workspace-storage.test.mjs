import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_KEY } from '../src/storage.mjs';
import { addBoard } from '../src/workspace.mjs';
import { WORKSPACE_KEY, WORKSPACE_BACKUP_KEY, openWorkspace, writeWorkspace, writeWorkspaceLocked, WORKSPACE_LOCK, inspectWorkspaceRecovery, restoreWorkspaceBackup, WORKSPACE_DAMAGED_KEY, parseWorkspace } from '../src/workspace-storage.mjs';

function memory(initial = {}) {
 const values = new Map(Object.entries(initial));
 return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const legacy = JSON.stringify({ nodes: [{ id: 'n', position: { x: 1, y: 2 }, data: { label: 'API' } }], edges: [] });

test('opening and migrating legacy board never changes the original', () => {
 const store = memory({ [BOARD_KEY]: legacy });
 const opened = openWorkspace(store);
 assert.equal(opened.ok, true); assert.equal(opened.source, 'legacy');
 assert.equal(store.getItem(WORKSPACE_KEY), null);
 const saved = writeWorkspace(opened.workspace, opened.snapshot, store);
 assert.equal(saved.ok, true); assert.equal(store.getItem(BOARD_KEY), legacy);
 const reopened = openWorkspace(store);
 assert.equal(reopened.source, 'workspace');
 assert.equal(reopened.workspace.cards[0].data.label, 'API');
});

test('empty workspace can be saved and new boards survive reopening', () => {
 const store = memory(); const opened = openWorkspace(store);
 assert.equal(opened.source, 'empty');
 const updated = addBoard(opened.workspace, 'second', 'Second');
 assert.equal(writeWorkspace(updated, opened.snapshot, store).ok, true);
 assert.equal(openWorkspace(store).workspace.boards.length, 2);
});

test('stale legacy or workspace snapshots block the write', () => {
 const store = memory({ [BOARD_KEY]: legacy }); const opened = openWorkspace(store);
 store.setItem(BOARD_KEY, JSON.stringify({ nodes: [], edges: [] }));
 assert.match(writeWorkspace(opened.workspace, opened.snapshot, store).error, /changed/);
 assert.equal(store.getItem(WORKSPACE_KEY), null);
 const first = openWorkspace(store); const saved = writeWorkspace(first.workspace, first.snapshot, store);
 const stale = saved.snapshot; const fresh = openWorkspace(store);
 assert.equal(writeWorkspace(addBoard(fresh.workspace, 'other', 'Other'), fresh.snapshot, store).ok, true);
 assert.match(writeWorkspace(first.workspace, stale, store).error, /changed/);
});

test('existing workspace is backed up before replacement and legacy is preserved', () => {
 const store = memory({ [BOARD_KEY]: legacy }); const first = openWorkspace(store);
 assert.equal(writeWorkspace(first.workspace, first.snapshot, store).ok, true);
 const previous = store.getItem(WORKSPACE_KEY); const next = openWorkspace(store);
 assert.equal(writeWorkspace(addBoard(next.workspace, 'b', 'B'), next.snapshot, store).ok, true);
 assert.equal(store.getItem(WORKSPACE_BACKUP_KEY), previous);
 assert.equal(store.getItem(BOARD_KEY), legacy);
});

test('corrupt or future workspace never silently falls back to legacy', () => {
 for (const bad of ['{bad', '{"version":4,"cards":[],"boards":[]}']) {
   const store = memory({ [BOARD_KEY]: legacy, [WORKSPACE_KEY]: bad });
   assert.equal(openWorkspace(store).ok, false);
   assert.equal(store.getItem(WORKSPACE_KEY), bad);
 }
});

test('version 2 workspaces migrate on read and preserve nested links and raw recovery data until save', () => {
 const old = JSON.stringify({ version: 2, cards: [{ id: 'card', data: { label: 'API' } }],
   boards: [
     { id: 'board', title: 'Board', extra: {}, nodes: [{ id: 'node', cardId: 'card', position: { x: 2, y: 3 } }], edges: [] },
     { id: 'child', title: 'Child', extra: {}, parentPlacement: { boardId: 'board', nodeId: 'node' }, nodes: [], edges: [] },
   ] });
 const store = memory({ [WORKSPACE_KEY]: old, [BOARD_KEY]: legacy });
 const opened = openWorkspace(store);
 assert.equal(opened.ok, true);
 assert.equal(opened.workspace.version, 3);
 assert.equal(opened.workspace.boards[0].nodes[0].shape, 'pill');
 assert.deepEqual(opened.workspace.boards[0].notes, []);
 assert.deepEqual(opened.workspace.boards[1].parentPlacement, { boardId: 'board', nodeId: 'node' });
 assert.equal(store.getItem(WORKSPACE_KEY), old);
 const saved = writeWorkspace(opened.workspace, opened.snapshot, store);
 assert.equal(saved.ok, true);
 assert.equal(store.getItem(WORKSPACE_BACKUP_KEY), old);
 assert.equal(JSON.parse(store.getItem(WORKSPACE_KEY)).version, 3);
 assert.equal(openWorkspace(store).workspace.boards[0].nodes[0].shape, 'pill');
 assert.deepEqual(openWorkspace(store).workspace.boards[1].parentPlacement, { boardId: 'board', nodeId: 'node' });
 assert.equal(store.getItem(BOARD_KEY), legacy);
});

test('failed reads or writes report errors and leave legacy data intact', () => {
 const store = memory({ [BOARD_KEY]: legacy }); const opened = openWorkspace(store);
 const blocked = { getItem: store.getItem, setItem() { throw new Error('quota'); } };
 assert.equal(writeWorkspace(opened.workspace, opened.snapshot, blocked).ok, false);
 assert.equal(store.getItem(BOARD_KEY), legacy);
 assert.equal(store.getItem(WORKSPACE_KEY), null);
 assert.equal(openWorkspace({ getItem() { throw new Error('denied'); } }).ok, false);
});

test('rejects non-JSON and invalid workspaces without writing', () => {
 const store = memory(); const opened = openWorkspace(store);
 const bad = structuredClone(opened.workspace); bad.boards[0].extra.value = undefined;
 assert.equal(writeWorkspace(bad, opened.snapshot, store).ok, false);
 bad.boards[0].extra.value = NaN;
 assert.equal(writeWorkspace(bad, opened.snapshot, store).ok, false);
 assert.equal(parseWorkspace('{"version":99}'), null);
 assert.equal(store.getItem(WORKSPACE_KEY), null);
});

test('rejects sparse arrays, hidden properties, symbols, and circular data', () => {
 const store = memory(); const opened = openWorkspace(store);
 const workspace = opened.workspace;
 const sparse = Array(1); sparse.extra = 'would hide the hole';
 workspace.boards[0].extra = { sparse };
 assert.equal(writeWorkspace(workspace, opened.snapshot, store).ok, false);
 const hidden = {}; Object.defineProperty(hidden, 'secret', { value: 'not serialized' });
 workspace.boards[0].extra = hidden;
 assert.equal(writeWorkspace(workspace, opened.snapshot, store).ok, false);
 workspace.boards[0].extra = { [Symbol('lost')]: 'value' };
 assert.equal(writeWorkspace(workspace, opened.snapshot, store).ok, false);
 const cyclic = {}; cyclic.self = cyclic;
 workspace.boards[0].extra = cyclic;
 assert.equal(writeWorkspace(workspace, opened.snapshot, store).ok, false);
 assert.equal(store.getItem(WORKSPACE_KEY), null);
});

test('locked writes fail closed if browser locking is missing or fails', async () => {
 const store = memory(); const opened = openWorkspace(store);
 assert.match((await writeWorkspaceLocked(opened.workspace, opened.snapshot, store, null)).error, /lock support/);
 const rejected = { request() { return Promise.reject(new Error('denied')); } };
 assert.match((await writeWorkspaceLocked(opened.workspace, opened.snapshot, store, rejected)).error, /lock/);
 assert.equal(store.getItem(WORKSPACE_KEY), null);
});

test('serialized writers with the same snapshot do not both succeed', async () => {
 const store = memory(); const first = openWorkspace(store); const second = openWorkspace(store);
 let tail = Promise.resolve();
 const locks = {
   request(name, options, callback) {
     assert.equal(name, WORKSPACE_LOCK); assert.equal(options.mode, 'exclusive');
     const result = tail.then(callback); tail = result.then(() => undefined, () => undefined); return result;
   },
 };
 const outcomes = await Promise.all([
   writeWorkspaceLocked(addBoard(first.workspace, 'a', 'A'), first.snapshot, store, locks),
   writeWorkspaceLocked(addBoard(second.workspace, 'b', 'B'), second.snapshot, store, locks),
 ]);
 assert.equal(outcomes.filter(result => result.ok).length, 1);
 assert.match(outcomes.find(result => !result.ok).error, /changed/);
});

const directLock = { request(_name, _options, callback) { return Promise.resolve(callback()); } };
test('explicit recovery preserves the damaged workspace and legacy board', async () => {
 const store = memory({ [BOARD_KEY]: legacy }); const opened = openWorkspace(store);
 const valid = JSON.stringify(opened.workspace);
 store.setItem(WORKSPACE_KEY, '{bad'); store.setItem(WORKSPACE_BACKUP_KEY, valid);
 const inspection = inspectWorkspaceRecovery(store);
 assert.equal(inspection.ok, true);
 const result = await restoreWorkspaceBackup(inspection.snapshot, store, directLock);
 assert.equal(result.ok, true); assert.equal(store.getItem(WORKSPACE_KEY), valid);
 assert.equal(store.getItem(WORKSPACE_DAMAGED_KEY), '{bad');
 assert.equal(store.getItem(BOARD_KEY), legacy); assert.equal(store.getItem(WORKSPACE_BACKUP_KEY), valid);
});

test('recovery upgrades a version 2 backup in memory without discarding raw nested links', async () => {
 const oldBackup = JSON.stringify({ version: 2, cards: [{ id: 'card', data: { label: 'API' } }],
   boards: [
     { id: 'board', title: 'Board', extra: {}, nodes: [{ id: 'node', cardId: 'card', position: { x: 0, y: 0 } }], edges: [] },
     { id: 'child', title: 'Child', extra: {}, parentPlacement: { boardId: 'board', nodeId: 'node' }, nodes: [], edges: [] },
   ] });
 const store = memory({ [BOARD_KEY]: legacy, [WORKSPACE_KEY]: '{broken', [WORKSPACE_BACKUP_KEY]: oldBackup });
 const inspection = inspectWorkspaceRecovery(store);
 assert.equal(inspection.ok, true);
 const restored = await restoreWorkspaceBackup(inspection.snapshot, store, directLock);
 assert.equal(restored.ok, true);
 assert.equal(restored.workspace.version, 3);
 assert.equal(restored.workspace.boards[0].nodes[0].shape, 'pill');
 assert.deepEqual(restored.workspace.boards[1].parentPlacement, { boardId: 'board', nodeId: 'node' });
 assert.equal(store.getItem(WORKSPACE_KEY), oldBackup);
 assert.equal(store.getItem(WORKSPACE_BACKUP_KEY), oldBackup);
 assert.equal(store.getItem(BOARD_KEY), legacy);
 assert.equal(openWorkspace(store).workspace.version, 3);
 assert.deepEqual(openWorkspace(store).workspace.boards[1].parentPlacement, { boardId: 'board', nodeId: 'node' });
});

test('recovery refuses stale data, unknown versions, or existing different archive', async () => {
 const store = memory(); const valid = JSON.stringify(openWorkspace(store).workspace);
 store.setItem(WORKSPACE_KEY, '{bad'); store.setItem(WORKSPACE_BACKUP_KEY, valid);
 const inspection = inspectWorkspaceRecovery(store);
 store.setItem(WORKSPACE_BACKUP_KEY, JSON.stringify(addBoard(openWorkspace(memory()).workspace, 'b', 'B')));
 assert.match((await restoreWorkspaceBackup(inspection.snapshot, store, directLock)).error, /changed/);
 assert.equal(store.getItem(WORKSPACE_KEY), '{bad');
 store.setItem(WORKSPACE_KEY, '{"version":4,"boards":[],"cards":[]}');
 assert.match(inspectWorkspaceRecovery(store).error, /unsupported/);
 store.setItem(WORKSPACE_KEY, '{bad'); store.setItem(WORKSPACE_DAMAGED_KEY, '{older');
 assert.match(inspectWorkspaceRecovery(store).error, /already preserved/);
});

test('recovery fails safely without locks or when archive write fails', async () => {
 const store = memory(); const valid = JSON.stringify(openWorkspace(store).workspace);
 store.setItem(WORKSPACE_KEY, '{bad'); store.setItem(WORKSPACE_BACKUP_KEY, valid);
 const snapshot = inspectWorkspaceRecovery(store).snapshot;
 assert.equal((await restoreWorkspaceBackup(snapshot, store, null)).ok, false);
 const blocked = { getItem: store.getItem, setItem() { throw new Error('quota'); } };
 assert.equal((await restoreWorkspaceBackup(snapshot, blocked, directLock)).ok, false);
 assert.equal(store.getItem(WORKSPACE_KEY), '{bad');
});

test('quota failure after backing up a valid workspace leaves the primary intact', () => {
 const store = memory({ [BOARD_KEY]: legacy });
 let opened = openWorkspace(store);
 assert.equal(writeWorkspace(opened.workspace, opened.snapshot, store).ok, true);
 opened = openWorkspace(store);
 const previous = store.getItem(WORKSPACE_KEY);
 const partial = { getItem: store.getItem, setItem(key, value) {
   if (key === WORKSPACE_KEY) throw new Error('quota');
   store.setItem(key, value);
 } };
 const result = writeWorkspace(addBoard(opened.workspace, 'next', 'Next'), opened.snapshot, partial);
 assert.equal(result.ok, false);
 assert.equal(store.getItem(WORKSPACE_KEY), previous);
 assert.equal(store.getItem(WORKSPACE_BACKUP_KEY), previous);
 assert.equal(store.getItem(BOARD_KEY), legacy);
});

test('recovery interrupted after archiving can be inspected and retried', async () => {
 const store = memory({ [BOARD_KEY]: legacy });
 const valid = JSON.stringify(openWorkspace(store).workspace);
 store.setItem(WORKSPACE_KEY, '{broken'); store.setItem(WORKSPACE_BACKUP_KEY, valid);
 const inspected = inspectWorkspaceRecovery(store);
 const partial = { getItem: store.getItem, setItem(key, value) {
   if (key === WORKSPACE_KEY) throw new Error('quota');
   store.setItem(key, value);
 } };
 assert.equal((await restoreWorkspaceBackup(inspected.snapshot, partial, directLock)).ok, false);
 assert.equal(store.getItem(WORKSPACE_KEY), '{broken');
 assert.equal(store.getItem(WORKSPACE_DAMAGED_KEY), '{broken');
 const rechecked = inspectWorkspaceRecovery(store);
 assert.equal(rechecked.ok, true);
 assert.equal((await restoreWorkspaceBackup(rechecked.snapshot, store, directLock)).ok, true);
 assert.equal(store.getItem(WORKSPACE_KEY), valid);
 assert.equal(store.getItem(BOARD_KEY), legacy);
});
