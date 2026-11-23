import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFileMap, selectedFileDetails, MAX_SOURCE_FILE_BYTES, MAX_SOURCE_TOTAL_BYTES } from '../src/file-map.mjs';
import { applyMapRefresh, mapRefreshContents, previewMapRefresh } from '../src/map-refresh.mjs';
import { addMiniBoard, addNote, changeAttachment, migrateLegacyBoard, placeCard, validateWorkspace } from '../src/workspace.mjs';

function fixture(paths, source = new Map(), details = new Map()) {
  let next = 0;
  const makeId = () => 'generated-' + ++next;
  const empty = migrateLegacyBoard(JSON.stringify({ nodes: [], edges: [] }));
  return { workspace: createFileMap(empty, 'map', 'Code', paths, makeId, source, details), makeId };
}

test('path-only refresh compares every file type and saves details only for accepted changes', () => {
  const file = (name, size, lastModified) => ({ name, webkitRelativePath: 'repo/' + name, size, lastModified,
    arrayBuffer() { assert.fail('Path-only comparisons must not read a file'); } });
  const original = [file('a.bin', 10, 1), file('b.bin', 10, 2), file('c.bin', 10, 3)];
  const originalDetails = selectedFileDetails(original);
  const { workspace, makeId } = fixture([...originalDetails.keys()], new Map(), originalDetails);
  const picked = [file('a.bin', 20, 1), file('b.bin', 10, 12), file('c.bin', 10, 3), file('d.bin', 0, 0)];
  const details = selectedFileDetails(picked);
  const paths = [...details.keys()];
  const changes = previewMapRefresh(workspace, 'map', paths, undefined, details);
  assert.deepEqual(changes.map(({ path, kind }) => [path, kind]), [
    ['repo/a.bin', 'changed'], ['repo/b.bin', 'changed'], ['repo/d.bin', 'added'],
  ]);
  const accepted = ['repo/b.bin', 'repo/d.bin'];
  const next = applyMapRefresh(workspace, 'map', changes, accepted, makeId);
  const saved = JSON.parse(JSON.stringify(next));
  assert.ok(validateWorkspace(saved));
  assert.deepEqual(previewMapRefresh(saved, 'map', paths, undefined, details).map(change => change.path), ['repo/a.bin']);
  assert.ok(saved.cards.every(card => card.data.sourceText === undefined));
  assert.deepEqual(saved.boards[1].nodes.map(node => node.fileDetails), [
    { size: 10, lastModified: 1 }, { size: 10, lastModified: 12 }, { size: 10, lastModified: 3 }, { size: 0, lastModified: 0 },
  ]);
  assert.deepEqual(workspace.boards[1].nodes.map(node => node.fileDetails), [...originalDetails.values()]);
  assert.throws(() => applyMapRefresh(saved, 'map', changes, ['repo/b.bin'], makeId), /changed/);
});

test('legacy file details can be recorded selectively without claiming a prior change', () => {
  const { workspace, makeId } = fixture(['main.ts', 'asset.bin'], new Map([['main.ts', 'cached']]));
  workspace.boards[1].nodes[0].fileDetails = { size: -1, lastModified: 'unknown' };
  const details = selectedFileDetails([
    { webkitRelativePath: 'repo/main.ts', size: 6, lastModified: 15 },
    { webkitRelativePath: 'repo/asset.bin', size: 42, lastModified: 25 },
    { name: 'unknown', size: 0 },
  ]);
  const paths = ['repo/main.ts', 'repo/asset.bin'];
  const changes = previewMapRefresh(workspace, 'map', paths, undefined, details);
  assert.deepEqual(changes.map(({ path, kind }) => [path, kind]), [['asset.bin', 'baseline'], ['main.ts', 'baseline']]);
  const next = applyMapRefresh(workspace, 'map', changes, ['asset.bin'], makeId);
  assert.equal(next.cards.find(card => card.data.path === 'main.ts').data.sourceText, 'cached');
  assert.deepEqual(next.boards[1].nodes[0].fileDetails, { size: 42, lastModified: 25 });
  assert.equal(next.boards[1].nodes[1].fileDetails, undefined);
  assert.deepEqual(previewMapRefresh(next, 'map', paths, undefined, details).map(change => change.path), ['main.ts']);
  assert.ok(!details.has('unknown'));
});

test('folder refresh applies only approved path changes and preserves the virtual board', () => {
  const source = new Map([['repo/app.js', 'before'], ['repo/old.js', 'cached']]);
  const initial = fixture(['repo/app.js', 'repo/old.js', 'repo/skip.py'], source);
  const { makeId } = initial;
  let w = initial.workspace;
  const [app, old] = w.boards[1].nodes;
  app.position = { x: -10, y: 200 };
  app.shape = 'diamond';
  w.cards.find(card => card.id === app.cardId).data.label = 'Human label';
  w.boards[1].edges.push({ id: 'manual', source: app.id, target: old.id, label: 'manual' });
  w = addNote(w, 'map', { id: 'note', text: 'keep', position: { x: 10, y: 900 } });
  w = addMiniBoard(w, 'map', old.id, 'child', 'Old details');
  w = changeAttachment(w, 'component', old.cardId, { id: 'f', name: 'old.bin', size: 1, base64: 'AA==' });
  w = placeCard(w, 'board-1', app.cardId, { id: 'other', position: { x: 0, y: 0 } });
  w = placeCard(w, 'map', old.cardId, { id: 'duplicate', position: { x: 500, y: 0 } });
  const before = structuredClone(w);
  const names = ['repo/new.ts', 'repo/app.js', 'repo/skip.py', 'repo/optional.py'];
  const contents = new Map([['repo/app.js', 'after'], ['repo/new.ts', ''], ['repo/skip.py', 'not accepted']]);
  const changes = previewMapRefresh(w, 'map', names, contents);
  assert.deepEqual(changes.map(item => [item.path, item.kind]), [
    ['repo/app.js', 'changed'], ['repo/new.ts', 'added'], ['repo/old.js', 'missing'],
    ['repo/optional.py', 'added'], ['repo/skip.py', 'changed'],
  ]);
  const next = applyMapRefresh(w, 'map', changes, ['repo/old.js', 'repo/app.js', 'repo/new.ts'], makeId);
  assert.deepEqual(w, before);
  assert.ok(validateWorkspace(next));
  const board = next.boards[1];
  assert.deepEqual(board.notes, before.boards[1].notes);
  assert.deepEqual(board.edges, before.boards[1].edges);
  assert.deepEqual(next.boards[2], before.boards[2]);
  assert.deepEqual(board.nodes[0], before.boards[1].nodes[0]);
  assert.deepEqual(next.boards[0].nodes, before.boards[0].nodes);
  assert.equal(next.cards.find(card => card.id === app.cardId).data.sourceText, 'after');
  assert.equal(next.cards.find(card => card.id === app.cardId).data.label, 'Human label');
  assert.equal(next.cards.find(card => card.data.path === 'repo/skip.py').data.sourceText, undefined);
  assert.equal(next.cards.find(card => card.data.path === 'repo/new.ts').data.sourceText, '');
  assert.equal(next.cards.find(card => card.data.path === 'repo/optional.py'), undefined);
  assert.equal(board.nodes.filter(node => node.fileMissing && node.cardId === old.cardId).length, 2);
  assert.deepEqual(next.cards.find(card => card.id === old.cardId), before.cards.find(card => card.id === old.cardId));
  assert.ok(board.nodes.at(-1).position.y > 900);
  assert.throws(() => applyMapRefresh(next, 'map', changes, ['repo/app.js'], makeId), /changed/);

  const reloaded = JSON.parse(JSON.stringify(next));
  const restored = previewMapRefresh(reloaded, 'map', [...names, 'repo/old.js']);
  assert.equal(restored.find(item => item.path === 'repo/old.js').kind, 'restored');
  const preserved = applyMapRefresh(reloaded, 'map', restored, ['repo/old.js'], makeId);
  assert.deepEqual(preserved.boards[1].nodes.filter(node => node.cardId === old.cardId), before.boards[1].nodes.filter(node => node.cardId === old.cardId));
  assert.deepEqual(preserved.cards.find(card => card.id === old.cardId), before.cards.find(card => card.id === old.cardId));
});

test('a folder with only excluded files can report missing tracked files once its root is verified', () => {
  const { workspace, makeId } = fixture(['repo/app.ts', 'repo/dist/old.js']);
  const picked = Array.from({ length: 101 }, (_, i) => 'repo/dist/' + i + '.js');
  const preview = (w, paths) => previewMapRefresh(w, 'map', paths, undefined, undefined, true);
  const changes = preview(workspace, picked);
  assert.deepEqual(changes.map(({ kind, path }) => [kind, path]), [['missing', 'repo/app.ts']]);
  assert.equal(mapRefreshContents(workspace, 'map', picked, new Map(), true).size, 0);
  const next = applyMapRefresh(workspace, 'map', changes, ['repo/app.ts'], makeId);
  assert.equal(next.boards[1].nodes[0].fileMissing, true);
  assert.equal(next.boards[1].nodes[1].fileMissing, undefined);
  assert.deepEqual(preview(next, picked), []);
  assert.throws(() => preview(workspace, []), /at least one file/);
  assert.throws(() => preview(workspace, ['other/dist/out.js']), /original folder/);
  assert.throws(() => preview(workspace, ['repo/dist/out.js', 'other/dist/out.js']), /one project folder/);
  const flat = fixture(['app.ts']);
  assert.throws(() => preview(flat.workspace, picked), /originally mapped/);
  delete workspace.boards[1].fileMapFolder;
  assert.deepEqual(preview(workspace, picked), changes);
});

test('older folder and filename maps match only compatible folder paths and normalize opted-in sources', () => {
  const folder = fixture(['project/app.ts', 'project/README.md']);
  delete folder.workspace.boards[1].fileMapFolder;
  assert.throws(() => previewMapRefresh(folder.workspace, 'map', ['wrong/app.ts']), /original project folder/);
  assert.deepEqual(previewMapRefresh(folder.workspace, 'map', ['project/app.ts', 'project/README.md']), []);
  const { workspace, makeId } = fixture(['app.ts', 'README.md']);
  const names = ['repo/app.ts', 'repo/src/nested.ts'];
  const src = new Map([['repo/app.ts', 'app'], ['repo/src/nested.ts', 'nested']]);
  assert.deepEqual([...mapRefreshContents(workspace, 'map', names, src)], [['app.ts', 'app'], ['src/nested.ts', 'nested']]);
  const changes = previewMapRefresh(workspace, 'map', names, src);
  const first = applyMapRefresh(workspace, 'map', changes, changes.map(item => item.path), makeId);
  assert.deepEqual(previewMapRefresh(first, 'map', names, src), []);
  assert.throws(() => previewMapRefresh(first, 'map', ['other/app.ts']), /original folder/);
  assert.throws(() => previewMapRefresh(workspace, 'map', ['other/different.ts']), /originally mapped/);
  assert.throws(() => previewMapRefresh(workspace, 'map', ['repo/app.ts', 'elsewhere/README.md']), /one project folder/);
});

test('skipped source and unrelated manually placed files survive refresh', () => {
  const { workspace, makeId } = fixture(['repo/app.ts'], new Map([['repo/app.ts', 'cached']]));
  const external = createFileMap(workspace, 'separate', 'Other files', ['other/x.go'], makeId);
  const card = external.cards.find(item => item.data.path === 'other/x.go');
  const mixed = placeCard(external, 'map', card.id, { id: 'manually-placed', position: { x: 0, y: 0 } });
  assert.deepEqual(previewMapRefresh(mixed, 'map', ['repo/app.ts']), []);
  assert.equal(mixed.cards[0].data.sourceText, 'cached');
  assert.equal(applyMapRefresh(mixed, 'map', [], [], makeId), mixed);
});

test('refresh rejects ambiguous input, invalid source sizes and colliding IDs without changing the workspace', () => {
  const { workspace } = fixture(['repo/first.ts']);
  const before = structuredClone(workspace);
  assert.throws(() => previewMapRefresh(workspace, 'map', ['repo/first.ts', 'repo/first.ts']), /unique/);
  assert.throws(() => previewMapRefresh(workspace, 'map', ['repo/../first.ts']), /invalid/);
  assert.throws(() => previewMapRefresh(workspace, 'map', ['repo/first.ts'], new Map([['repo/missing.ts', 'x']])), /contents/);
  assert.throws(() => previewMapRefresh(workspace, 'map', ['repo/first.ts'], new Map([['repo/first.ts', 'ß'.repeat(MAX_SOURCE_FILE_BYTES)]])), /size limit/);
  const many = Array.from({ length: MAX_SOURCE_TOTAL_BYTES / MAX_SOURCE_FILE_BYTES + 1 }, (_, i) => 'repo/' + i + '.ts');
  assert.throws(() => previewMapRefresh(workspace, 'map', many, new Map(many.map(path => [path, 'x'.repeat(MAX_SOURCE_FILE_BYTES)]))), /size limit/);
  const changes = previewMapRefresh(workspace, 'map', ['repo/second.ts']);
  assert.throws(() => applyMapRefresh(workspace, 'map', changes, ['repo/second.ts'], () => workspace.cards[0].id), /valid file placements/);
  assert.throws(() => applyMapRefresh(workspace, 'map', changes, ['repo/typo.ts'], () => 'id'), /Unknown/);
  assert.deepEqual(workspace, before);
});
