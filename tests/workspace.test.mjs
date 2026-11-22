import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyBoard, migrateWorkspaceV2, projectBoard, validateWorkspace, addBoard, addMiniBoard, getMiniBoard, getBoardBreadcrumbs, addNote, updateNote, removeNote, updatePlacementShape, removeBoard, removeBoardTree, removePlacementTree, placeCard, updateCard, renameBoard, findCards, findCardPlacements, createMermaidBoard, changeAttachment, MAX_FILE_BYTES } from '../src/workspace.mjs';

const fixture = {
  viewport: { x: 4, y: 5, zoom: 1 },
  nodes: [
    { id: 'a', position: { x: 2, y: 3 }, data: { label: 'API', notes: 'backend' }, width: 200 },
    { id: 'b', position: { x: 8, y: 9 }, data: { label: 'Database' } },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b', label: 'reads' }],
};

test('attachment IDs are scoped to their owners, including during removal', () => {
  const original = migrateLegacyBoard(JSON.stringify(fixture));
  const file = { id: 'same', name: 'drawing.bin', size: 1, base64: '/w==' };
  const shared = changeAttachment(original, 'workspace', '', file);
  const board = changeAttachment(shared, 'board', 'board-1', { ...file, base64: 'AA==' });
  const card = changeAttachment(board, 'component', 'card:a', { ...file, size: 0, base64: '' });
  const removed = changeAttachment(card, 'board', 'board-1', file.id);
  file.name = 'renamed-elsewhere.bin';
  assert.equal(shared.attachments[0].name, 'drawing.bin');
  assert.equal(validateWorkspace(removed), true);
  assert.equal(original.attachments, undefined);
  assert.equal(card.boards[0].attachments[0].base64, 'AA==');
  assert.deepEqual(removed.boards[0].attachments, []);
  assert.equal(removed.attachments[0].base64, '/w==');
  assert.equal(removed.cards[0].attachments[0].base64, '');
  assert.throws(() => changeAttachment(card, 'component', 'card:a', file));
  assert.throws(() => changeAttachment(card, 'board', 'missing', file));
  assert.throws(() => changeAttachment(card, 'unknown-scope', 'card:a', file));
});

test('attachment size and count limits apply across scopes and invalid encoded data is rejected', () => {
  const original = migrateLegacyBoard(JSON.stringify(fixture));
  const fullFile = { id: 'full', name: 'large.bin', size: MAX_FILE_BYTES, base64: Buffer.alloc(MAX_FILE_BYTES).toString('base64') };
  let workspace = changeAttachment(original, 'workspace', '', fullFile);
  workspace = changeAttachment(workspace, 'board', 'board-1', fullFile);
  workspace = changeAttachment(workspace, 'component', 'card:a', fullFile);
  workspace = changeAttachment(workspace, 'component', 'card:b', fullFile);
  assert.equal(validateWorkspace(workspace), true);
  const extra = { id: 'extra', name: 'extra.bin', size: 1, base64: 'AA==' };
  assert.throws(() => changeAttachment(workspace, 'workspace', '', extra));
  for (const invalid of [{ base64: 'A===' }, { base64: '!A==' }, { size: 2 }, { size: MAX_FILE_BYTES + 1 }]) {
    assert.equal(validateWorkspace({ ...original, attachments: [{ ...extra, ...invalid }] }), false);
  }
  const empty = { id: 'empty', name: 'empty', size: 0, base64: '' };
  const many = { ...original, attachments: Array.from({ length: 128 }, (_, i) => ({ ...empty, id: String(i) })) };
  assert.equal(validateWorkspace(many), true);
  assert.throws(() => changeAttachment(many, 'component', 'card:a', empty));
});

test('legacy board migration is reversible and does not mutate input', () => {
  const raw = JSON.stringify(fixture);
  const workspace = migrateLegacyBoard(raw);
  assert.equal(validateWorkspace(workspace), true);
  const expected = structuredClone(fixture);
  expected.nodes.forEach(node => { node.shape = 'pill'; });
  assert.deepEqual(projectBoard(workspace, 'board-1'), expected);
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
  assert.equal(validateWorkspace({ ...workspace, version: 4 }), false);
  assert.throws(() => addBoard(workspace, 'board-1', 'Duplicate'));
  assert.throws(() => placeCard(workspace, 'board-1', 'missing', { id: 'x', position: { x: 1, y: 1 } }));
  assert.throws(() => placeCard(workspace, 'board-1', 'card:a', { id: 'a', position: { x: 1, y: 1 } }));
  assert.throws(() => updateCard(workspace, 'missing', {}));
  assert.throws(() => projectBoard(workspace, 'missing'));
});

test('version 2 migration preserves valid placement ancestry and rejects broken trees', () => {
  const legacy = {
    version: 2,
    cards: [{ id: 'card', data: { label: 'API' } }],
    boards: [
      { id: 'root', title: 'Root', extra: {}, nodes: [{ id: 'placement', cardId: 'card', position: { x: 0, y: 0 } }], edges: [] },
      { id: 'child', title: 'Child', extra: {}, parentPlacement: { boardId: 'root', nodeId: 'placement' }, nodes: [], edges: [] },
    ],
  };
  const migrated = migrateWorkspaceV2(legacy);
  assert.equal(validateWorkspace(migrated), true);
  assert.deepEqual(migrated.boards.map(board => board.parentPlacement), [
    null, { boardId: 'root', nodeId: 'placement' },
  ]);
  assert.deepEqual(migrated.boards.map(board => board.notes), [[], []]);

  const dangling = structuredClone(legacy);
  dangling.boards[1].parentPlacement.nodeId = 'missing';
  assert.equal(migrateWorkspaceV2(dangling).boards[1].parentPlacement, null);
  assert.equal(dangling.boards[1].parentPlacement.nodeId, 'missing');
  dangling.boards.shift();
  assert.equal(migrateWorkspaceV2(dangling).boards[0].title, 'Child');

  const duplicate = structuredClone(legacy);
  duplicate.boards.push({ id: 'second-child', title: 'Second child', extra: {},
    parentPlacement: { boardId: 'root', nodeId: 'placement' }, nodes: [], edges: [] });
  assert.throws(() => migrateWorkspaceV2(duplicate), /Invalid version 2/);

  const cyclic = structuredClone(legacy);
  cyclic.boards[0].parentPlacement = { boardId: 'child', nodeId: 'child-placement' };
  cyclic.boards[1].nodes.push({ id: 'child-placement', cardId: 'card', position: { x: 1, y: 1 } });
  assert.throws(() => migrateWorkspaceV2(cyclic), /Invalid version 2/);
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
      { id: 'new-3', position: { x: 60, y: 60 }, shape: 'pill', data: { label: 'API' } },
      { id: 'new-5', position: { x: 300, y: 60 }, shape: 'pill', data: { label: 'Database' } },
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

test('nested boards are unique per placement, independently chained, and breadcrumbed', () => {
  let workspace = migrateLegacyBoard(JSON.stringify(fixture));
  workspace = addBoard(workspace, 'second-root', 'Second root');
  workspace = placeCard(workspace, 'second-root', 'card:a', { id: 'api-copy', position: { x: 5, y: 6 } });
  workspace = addMiniBoard(workspace, 'board-1', 'a', 'first-mini', 'First mini');
  workspace = addMiniBoard(workspace, 'second-root', 'api-copy', 'second-mini', 'Second mini');
  workspace = placeCard(workspace, 'first-mini', 'card:b', { id: 'db-in-mini', position: { x: 1, y: 2 } });
  workspace = addMiniBoard(workspace, 'first-mini', 'db-in-mini', 'third-level', 'Third level');
  assert.equal(getMiniBoard(workspace, 'board-1', 'a').id, 'first-mini');
  assert.equal(getMiniBoard(workspace, 'second-root', 'api-copy').id, 'second-mini');
  assert.deepEqual(getBoardBreadcrumbs(workspace, 'third-level'), [
    { boardId: 'board-1', title: 'My board' },
    { boardId: 'first-mini', title: 'API', parentBoardId: 'board-1', parentNodeId: 'a' },
    { boardId: 'third-level', title: 'Database', parentBoardId: 'first-mini', parentNodeId: 'db-in-mini' },
  ]);
  assert.throws(() => addMiniBoard(workspace, 'board-1', 'a', 'duplicate', 'Duplicate'));
  assert.throws(() => addMiniBoard(workspace, 'board-1', 'a', 'blank', '   '));
});

test('notes and component shapes persist in their own board and placement', () => {
  let workspace = migrateLegacyBoard(JSON.stringify(fixture));
  workspace = addBoard(workspace, 'other', 'Other');
  workspace = updatePlacementShape(workspace, 'board-1', 'a', 'diamond');
  workspace = addNote(workspace, 'board-1', { id: 'note', text: 'Observation', position: { x: 10, y: 20 } });
  workspace = updateNote(workspace, 'board-1', 'note', 'Updated observation');
  const reopened = JSON.parse(JSON.stringify(workspace));
  assert.equal(validateWorkspace(reopened), true);
  assert.equal(reopened.boards[0].nodes[0].shape, 'diamond');
  assert.deepEqual(reopened.boards[0].notes, [{ id: 'note', text: 'Updated observation', position: { x: 10, y: 20 } }]);
  assert.deepEqual(reopened.boards[1].notes, []);
  assert.throws(() => updatePlacementShape(workspace, 'board-1', 'a', 'circle'));
  assert.throws(() => addNote(workspace, 'other', { id: 'note', text: '', position: { x: NaN, y: 1 } }));
  workspace = removeNote(workspace, 'board-1', 'note');
  assert.equal(workspace.boards[0].notes.length, 0);
});

test('nested links fail closed for dangling placements and cycles', () => {
  let workspace = migrateLegacyBoard(JSON.stringify(fixture));
  workspace = addMiniBoard(workspace, 'board-1', 'a', 'child', 'Child');
  workspace = placeCard(workspace, 'child', 'card:b', { id: 'child-node', position: { x: 0, y: 0 } });
  const dangling = structuredClone(workspace);
  dangling.boards[1].parentPlacement.nodeId = 'missing';
  assert.equal(validateWorkspace(dangling), false);
  const cycle = structuredClone(workspace);
  cycle.boards[0].parentPlacement = { boardId: 'child', nodeId: 'child-node' };
  assert.equal(validateWorkspace(cycle), false);
});

test('deleting placements or boards explicitly cascades nested contents without orphans', () => {
  let workspace = migrateLegacyBoard(JSON.stringify(fixture));
  workspace = addBoard(workspace, 'other-root', 'Other root');
  workspace = addMiniBoard(workspace, 'board-1', 'a', 'child', 'Child');
  workspace = placeCard(workspace, 'child', 'card:b', { id: 'child-node', position: { x: 1, y: 2 } });
  workspace = addMiniBoard(workspace, 'child', 'child-node', 'grandchild', 'Grandchild');
  assert.throws(() => removeBoard(workspace, 'board-1'), /nested boards/);
  const withoutPlacement = removePlacementTree(workspace, 'board-1', 'a');
  assert.equal(withoutPlacement.boards.some(board => ['child', 'grandchild'].includes(board.id)), false);
  assert.equal(withoutPlacement.boards[0].nodes.some(node => node.id === 'a'), false);
  assert.equal(validateWorkspace(withoutPlacement), true);
  const withoutTree = removeBoardTree(workspace, 'board-1');
  assert.deepEqual(withoutTree.boards.map(board => board.id), ['other-root']);
  assert.equal(validateWorkspace(withoutTree), true);
  assert.throws(() => removeBoardTree(withoutTree, 'other-root'), /last board/);
});
