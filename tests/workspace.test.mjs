import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyBoard, projectBoard, validateWorkspace, addBoard, placeCard, updateCard, renameBoard, removeBoard } from '../src/workspace.mjs';

const fixture = {
  viewport: { x: 4, y: 5, zoom: 1 },
  nodes: [
    { id: 'a', position: { x: 2, y: 3 }, data: { label: 'API', notes: 'backend' }, width: 200 },
    { id: 'b', position: { x: 8, y: 9 }, data: { label: 'Database' } },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b', label: 'reads' }],
};

test('legacy board migration is reversible and does not mutate input', () => {
  const raw = JSON.stringify(fixture);
  const workspace = migrateLegacyBoard(raw);
  assert.equal(validateWorkspace(workspace), true);
  assert.deepEqual(projectBoard(workspace, 'board-1'), fixture);
  assert.deepEqual(JSON.parse(raw), fixture);
});

test('shared card updates appear on every board while positions stay independent', () => {
  let workspace = migrateLegacyBoard(JSON.stringify(fixture));
  workspace = addBoard(workspace, 'board-2', 'Services');
  workspace = placeCard(workspace, 'board-2', 'card:a', { id: 'copy-a', position: { x: 100, y: 200 } });
  const previous = workspace;
  workspace = updateCard(workspace, 'card:a', { label: 'Gateway' });
  assert.equal(projectBoard(workspace, 'board-1').nodes[0].data.label, 'Gateway');
  assert.equal(projectBoard(workspace, 'board-2').nodes[0].data.label, 'Gateway');
  assert.deepEqual(projectBoard(workspace, 'board-2').nodes[0].position, { x: 100, y: 200 });
  assert.equal(projectBoard(previous, 'board-1').nodes[0].data.label, 'API');
});

test('invalid legacy boards do not silently migrate', () => {
  assert.throws(() => migrateLegacyBoard('{bad'));
  assert.throws(() => migrateLegacyBoard(JSON.stringify({ nodes: [{ ...fixture.nodes[0], cardId: 'legacy value' }], edges: [] })));
  assert.throws(() => migrateLegacyBoard(JSON.stringify({ nodes: [fixture.nodes[0], fixture.nodes[0]], edges: [] })));
  assert.throws(() => migrateLegacyBoard(JSON.stringify({ nodes: [fixture.nodes[0]], edges: fixture.edges })));
});

test('invalid references, collisions and unsupported versions are rejected', () => {
  const workspace = migrateLegacyBoard(JSON.stringify(fixture));
  assert.equal(validateWorkspace({ ...workspace, version: 3 }), false);
  assert.throws(() => addBoard(workspace, 'board-1', 'Duplicate'));
  assert.throws(() => placeCard(workspace, 'board-1', 'missing', { id: 'x', position: { x: 1, y: 1 } }));
  assert.throws(() => placeCard(workspace, 'board-1', 'card:a', { id: 'a', position: { x: 1, y: 1 } }));
  assert.throws(() => updateCard(workspace, 'missing', {}));
  assert.throws(() => projectBoard(workspace, 'missing'));
});

test('projected data is detached from the underlying workspace', () => {
  const workspace = migrateLegacyBoard(JSON.stringify(fixture));
  const board = projectBoard(workspace, 'board-1');
  board.nodes[0].data.label = 'local change';
  assert.equal(projectBoard(workspace, 'board-1').nodes[0].data.label, 'API');
});

test('board rename trims names, preserves the source and rejects invalid changes', () => {
  const before = migrateLegacyBoard(JSON.stringify(fixture));
  const renamed = renameBoard(before, 'board-1', '  Architecture  ');
  assert.equal(renamed.boards[0].title, 'Architecture');
  assert.equal(before.boards[0].title, 'My board');
  assert.deepEqual(renamed.cards, before.cards);
  assert.throws(() => renameBoard(before, 'missing', 'Name'));
  assert.throws(() => renameBoard(before, 'board-1', '   '));
  assert.throws(() => renameBoard(before, 'board-1', null));
});

test('board deletion keeps shared and unplaced cards and other boards intact', () => {
  let before = migrateLegacyBoard(JSON.stringify(fixture));
  before = addBoard(before, 'board-2', 'Other');
  before = placeCard(before, 'board-2', 'card:a', { id: 'copy-a', position: { x: 1, y: 2 } });
  const saved = structuredClone(before);
  const after = removeBoard(before, 'board-1');
  assert.deepEqual(before, saved);
  assert.deepEqual(after.cards, before.cards);
  assert.deepEqual(after.boards, [before.boards[1]]);
  assert.equal(validateWorkspace(JSON.parse(JSON.stringify(after))), true);
  assert.equal(projectBoard(after, 'board-2').nodes[0].data.label, 'API');
  assert.throws(() => removeBoard(after, 'board-2'), /last board/);
  assert.throws(() => removeBoard(before, 'missing'), /not found/);
});
