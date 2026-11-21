import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyBoard, projectBoard, validateWorkspace, addBoard, createMermaidBoard, placeCard, updateCard, renameBoard, setBoardGroup, removeBoard, findCards, findCardPlacements } from '../src/workspace.mjs';

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

test('board project areas trim names, can be removed and preserve existing board data', () => {
  const before = migrateLegacyBoard(JSON.stringify(fixture));
  const grouped = setBoardGroup(before, 'board-1', '  Platform team  ');
  assert.equal(grouped.boards[0].group, 'Platform team');
  assert.equal(Object.hasOwn(before.boards[0], 'group'), false);
  assert.deepEqual(grouped.boards[0].nodes, before.boards[0].nodes);
  assert.deepEqual(setBoardGroup(grouped, 'board-1', '   ').boards[0].group, undefined);
  assert.throws(() => setBoardGroup(before, 'missing', 'Platform team'));
  assert.throws(() => setBoardGroup(before, 'board-1', null));
  assert.equal(validateWorkspace({ ...before, boards: [{ ...before.boards[0], group: 42 }] }), false);
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

test('component search returns every placement, including unplaced cards', () => {
  let workspace = migrateLegacyBoard(JSON.stringify(fixture));
  workspace = addBoard(workspace, 'board-2', 'Services');
  workspace = placeCard(workspace, 'board-2', 'card:a', { id: 'api-2', position: { x: 0, y: 0 } });
  workspace = placeCard(workspace, 'board-2', 'card:a', { id: 'api-3', position: { x: 1, y: 1 } });
  workspace.cards.push({ id: 'unplaced', data: { label: 'API orphan' } });
  assert.deepEqual(findCards(workspace, ' aPi '), [
    { cardId: 'card:a', label: 'API', placements: [
      { boardId: 'board-1', boardTitle: 'My board', nodeId: 'a' },
      { boardId: 'board-2', boardTitle: 'Services', nodeId: 'api-2' },
      { boardId: 'board-2', boardTitle: 'Services', nodeId: 'api-3' },
    ] },
    { cardId: 'unplaced', label: 'API orphan', placements: [] },
  ]);
  assert.deepEqual(findCards(workspace, '  '), []);
  assert.deepEqual(findCards(workspace, 'absent'), []);
  assert.throws(() => findCards(workspace, null));
});

test('component appearances include all placements and update after a board is deleted', () => {
  let workspace = migrateLegacyBoard(JSON.stringify(fixture));
  workspace = addBoard(workspace, 'board-2', 'Other');
  workspace = placeCard(workspace, 'board-2', 'card:a', { id: 'copy-a', position: { x: 10, y: 20 } });
  assert.deepEqual(findCardPlacements(workspace, 'card:a'), [
    { boardId: 'board-1', boardTitle: 'My board', nodeId: 'a' },
    { boardId: 'board-2', boardTitle: 'Other', nodeId: 'copy-a' },
  ]);
  workspace = removeBoard(workspace, 'board-1');
  assert.deepEqual(findCardPlacements(workspace, 'card:b'), []);
  assert.equal(findCardPlacements(workspace, 'card:a').length, 1);
  assert.throws(() => findCardPlacements(workspace, 'unknown'));
});

test('Mermaid import creates a separate board with fresh cards, placements and relationships', () => {
  const before = migrateLegacyBoard(JSON.stringify(fixture));
  const original = structuredClone(before);
  const diagram = {
    nodes: [{ id: 'n0', label: 'API' }, { id: 'n1', label: 'Database' }],
    edges: [{ source: 'n0', target: 'n1', label: 'reads' }],
  };
  let nextId = 0;
  const imported = createMermaidBoard(before, '  Imported map  ', diagram, () => `new-${++nextId}`);
  assert.deepEqual(before, original);
  assert.equal(imported.workspace.boards[1].title, 'Imported map');
  assert.deepEqual(imported.workspace.boards[1].nodes.map(node => node.position), [
    { x: 60, y: 60 }, { x: 300, y: 60 },
  ]);
  assert.deepEqual(projectBoard(imported.workspace, imported.boardId), {
    nodes: [
      { id: 'new-3', position: { x: 60, y: 60 }, data: { label: 'API' } },
      { id: 'new-5', position: { x: 300, y: 60 }, data: { label: 'Database' } },
    ],
    edges: [{ id: 'new-6', source: 'new-3', target: 'new-5', label: 'reads' }],
  });
  assert.equal(imported.workspace.cards.some(card => card.id === 'card:a' && card.data.label === 'API'), true);
  assert.equal(validateWorkspace(imported.workspace), true);
});

test('Mermaid import rejects invalid diagrams and generated ID collisions without mutating workspace', () => {
  const before = migrateLegacyBoard(JSON.stringify(fixture));
  const original = structuredClone(before);
  assert.throws(() => createMermaidBoard(before, 'Imported', { nodes: [], edges: [] }), /Invalid Mermaid/);
  assert.throws(() => createMermaidBoard(before, 'Imported', {
    nodes: [{ id: 'n0', label: 'bad\uD800' }], edges: [],
  }), /Invalid Mermaid/);
  assert.throws(() => createMermaidBoard(before, 'Imported', {
    nodes: [{ id: 'n0', label: 'API' }], edges: [],
  }, () => 'card:a'), /unique IDs/);
  assert.deepEqual(before, original);
});

test('search only includes imported source when explicitly enabled', () => {
  const workspace = migrateLegacyBoard(JSON.stringify(fixture));
  workspace.cards[0].data.sourceText = 'function privateGateway() {}';
  assert.deepEqual(findCards(workspace, 'privategateway'), []);
  assert.equal(findCards(workspace, 'privategateway', { includeSource: true })[0].cardId, 'card:a');
  assert.equal(findCards(workspace, 'database', { includeSource: true })[0].cardId, 'card:b');
  assert.equal(findCards(workspace, 'privategateway', { includeSource: false }).length, 0);
});
