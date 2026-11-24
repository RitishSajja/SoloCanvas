import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoardContext, isContextRegion } from '../src/spatial-context.mjs';
import { migrateLegacyBoard, migrateWorkspaceV2 } from '../src/workspace.mjs';

function fixture() {
  const attachment = { id: 'attachment-private', name: 'attached-private', size: 3, base64: 'c2Vj' };
  const file = { id: '__proto__', data: {
    kind: 'file', label: 'Public gateway', path: 'repo/gateway.ts', sourceText: 'private source', arbitrary: 'private metadata',
  }, attachments: [attachment] };
  const position = { x: -12.5, y: 50, other: 'private geometry metadata' };
  const placement = { id: 'a', cardId: file.id, shape: 'rounded', position, width: 220, height: 80,
    measured: { width: 240, height: 92 }, fileMissing: true };
  const evidence = { sourcePath: file.data.path, targetPath: 'repo/db.ts', specifier: './db', line: 7, private: 'extra evidence' };
  const map = { id: 'map', title: 'Services', parentPlacement: null, extra: { private: 'board metadata' }, attachments: [attachment],
    nodes: [placement, { ...placement, id: 'Z', measured: null, fileMissing: false },
      { id: 'ä', cardId: 'db', position: { x: 400, y: 0 }, shape: 'rectangle', width: 'auto', height: -1 }],
    notes: [{ id: 'z', position, text: 'private note' }, { id: 'A', position: { x: 1, y: 0 }, text: 'another private note' }],
    edges: [
      { id: 'z', source: 'a', target: 'ä', label: 'loads', data: evidence },
      { id: 'a', source: 'Z', target: 'a', label: 'routes', data: { specifier: 'partial private evidence' } },
    ],
  };
  return { version: 3, attachments: [attachment], cards: [
    { id: 'unused', data: { label: 'outside only' } }, { id: 'db', data: { label: 'Database' } }, file,
  ], boards: [map, { id: 'mini', title: 'Nested private title', parentPlacement: { boardId: 'map', nodeId: 'a' },
    extra: {}, notes: [], edges: [], nodes: [
      { ...placement, id: 'other-placement', cardId: 'unused' },
      { ...placement, id: 'reused-on-child' },
    ] }] };
}

test('one-board context preserves identity, nested references, measured geometry and reviewed evidence', () => {
  const workspace = fixture();
  const context = buildBoardContext(workspace, 'map');
  assert.equal(context.format, 'solocanvas.board-context');
  assert.equal(context.version, 1);
  assert.deepEqual(context.scope, { kind: 'board' });
  assert.deepEqual(context.board, { id: 'map', title: 'Services', parentPlacement: null });
  assert.deepEqual(context.components, [
    { id: '__proto__', kind: 'file', label: 'Public gateway', path: 'repo/gateway.ts' },
    { id: 'db', kind: 'component', label: 'Database' },
  ]);
  assert.deepEqual(context.placements, [
    { id: 'Z', componentId: '__proto__', shape: 'rounded', position: { x: -12.5, y: 50 }, size: { width: 220, height: 80 } },
    { id: 'a', componentId: '__proto__', shape: 'rounded', position: { x: -12.5, y: 50 },
      size: { width: 240, height: 92 }, miniBoardId: 'mini', fileMissing: true },
    { id: 'ä', componentId: 'db', shape: 'rectangle', position: { x: 400, y: 0 } },
  ]);
  assert.deepEqual(context.relationships, [
    { id: 'a', sourcePlacementId: 'Z', targetPlacementId: 'a', label: 'routes', kind: 'manual' },
    { id: 'z', sourcePlacementId: 'a', targetPlacementId: 'ä', label: 'loads', kind: 'inferred',
      evidence: { sourcePath: 'repo/gateway.ts', targetPath: 'repo/db.ts', specifier: './db', line: 7, importKind: 'static' } },
  ]);
  assert.deepEqual(context.notes, [
    { id: 'A', position: { x: 1, y: 0 } }, { id: 'z', position: { x: -12.5, y: 50 } },
  ]);
  const child = buildBoardContext(workspace, 'mini');
  assert.deepEqual(child.board.parentPlacement, { boardId: 'map', placementId: 'a' });
  assert.deepEqual(child.relationships, []);
  assert.deepEqual(child.notes, []);
});

test('context bytes are deterministic across equivalent workspace orderings and detached from their input', () => {
  const workspace = fixture();
  const before = structuredClone(workspace);
  const context = buildBoardContext(workspace, 'map');
  assert.deepEqual(workspace, before);
  const reordered = structuredClone(workspace);
  reordered.cards.reverse();
  reordered.boards.reverse();
  for (const board of reordered.boards) {
    board.nodes.reverse();
    board.edges.reverse();
    board.notes.reverse();
  }
  assert.equal(JSON.stringify(buildBoardContext(reordered, 'map')), JSON.stringify(context));
  context.placements[0].position.x = 1234;
  context.notes[0].position.y = 987;
  context.relationships[1].evidence.line = 51;
  assert.deepEqual(workspace, before);
});

test('note text requires explicit opt-in and no option exports omitted fields or off-board content', () => {
  const workspace = fixture();
  workspace.cards[1].data.label = { sourceText: 'private label object' };
  workspace.boards[0].edges[1].label = ['private label object'];
  for (const options of [undefined, {}, { includeNoteText: 'true' }, { includeNoteText: true, includeSource: true }]) {
    const context = buildBoardContext(workspace, 'map', options);
    assert.equal(context.notes[1].text, options?.includeNoteText === true ? 'private note' : undefined);
    if (options?.includeNoteText !== true) assert.ok(context.notes.every(note => !Object.hasOwn(note, 'text')));
    const json = JSON.stringify(context);
    for (const excluded of ['private source', 'private metadata', 'board metadata', 'extra evidence', 'private label object',
      'private geometry metadata', 'partial private evidence', 'outside only', 'Nested private title', 'other-placement',
      'attachment-private', 'attached-private', 'c2Vj', 'base64', 'attachments', 'sourceText']) {
      assert.equal(json.includes(excluded), false, excluded);
    }
  }
});

test('projection does not access source or attachment data in the loaded workspace', () => {
  const workspace = fixture();
  const preventRead = (owner, key) => Object.defineProperty(owner, key, {
    get() { assert.fail('Unexpected read of ' + key); },
  });
  preventRead(workspace, 'attachments');
  for (const board of workspace.boards) preventRead(board, 'attachments');
  for (const card of workspace.cards) {
    preventRead(card, 'attachments');
    preventRead(card.data, 'sourceText');
  }
  assert.equal(buildBoardContext(workspace, 'map', { includeNoteText: true }).components.length, 2);
});

test('normal legacy migration and v2 orphan recovery supply usable shapes and root geometry', () => {
  const legacy = migrateLegacyBoard(JSON.stringify({ nodes: [
    { id: 'n', position: { x: 0, y: 4 }, data: { label: 'Old board' } },
  ], edges: [] }));
  const old = buildBoardContext(legacy, legacy.boards[0].id);
  assert.deepEqual(old.placements[0], { id: 'n', componentId: 'card:n', position: { x: 0, y: 4 }, shape: 'pill' });
  const migrated = migrateWorkspaceV2({ version: 2, cards: [], boards: [{ id: 'orphan', title: 'Orphan',
    extra: {}, parentPlacement: { boardId: 'gone', nodeId: 'gone' }, nodes: [], edges: [] }] });
  const empty = buildBoardContext(migrated, 'orphan');
  assert.deepEqual(empty.board, { id: 'orphan', title: 'Orphan', parentPlacement: null });
  assert.deepEqual([empty.placements, empty.components, empty.notes, empty.relationships], [[], [], [], []]);
  assert.throws(() => buildBoardContext(migrated, 'missing'), /Board not found/);
});

test('region intersects placement bounds, deduplicates shared components, and keeps only enclosed relationships', () => {
  const workspace = fixture();
  const board = workspace.boards[0];
  const region = { x: 200, y: 60, width: 50, height: 10, private: 'extra region data' };
  board.edges.push({ id: 'incoming', source: 'ä', target: 'a', label: 'outside to inside' });
  const project = () => buildBoardContext(workspace, 'map', { region });
  const context = project();
  assert.deepEqual(context.scope, { kind: 'region', x: 200, y: 60, width: 50, height: 10 });
  assert.deepEqual(context.placements.map(p => p.id), ['Z', 'a']);
  assert.deepEqual(context.components.map(c => c.id), ['__proto__']);
  assert.deepEqual(context.relationships.map(r => r.id), ['a']);
  assert.equal(context.placements[1].miniBoardId, 'mini');
  assert.deepEqual(context.notes, []);
  board.nodes.reverse();
  board.edges.reverse();
  assert.equal(JSON.stringify(project()), JSON.stringify(context));

  // Z ends exactly here. The measured 'a' extends beyond its stored width.
  region.x = 207.5;
  assert.deepEqual(project().placements.map(p => p.id), ['a']);
  assert.deepEqual(project().relationships, []);
  region.x = 227.5;
  const empty = project();
  assert.deepEqual([empty.placements, empty.components, empty.notes, empty.relationships], [[], [], [], []]);
  assert.equal(context.scope.x, 200);
});

test('region uses the minimum layout before measuring a component and refreshes with measured size', () => {
  const workspace = fixture();
  const node = workspace.boards[0].nodes[2];
  const region = { x: 603, y: 91, width: 1, height: 1 };
  const placements = () => buildBoardContext(workspace, 'map', { region }).placements;
  assert.deepEqual(placements().map(p => p.id), ['ä']);
  assert.equal(placements()[0].size, undefined);
  region.x = 604;
  assert.deepEqual(placements(), []);
  node.shape = 'diamond';
  assert.deepEqual(placements().map(p => p.id), ['ä']);
  region.y = 92;
  assert.deepEqual(placements(), []);
  node.measured = { width: 230, height: 100 };
  assert.deepEqual(placements().map(p => p.id), ['ä']);
});

test('legacy placements with a custom origin intersect at their rendered top-left', () => {
  const workspace = migrateLegacyBoard(JSON.stringify({ nodes: [
    { id: 'center', position: { x: 100, y: 100 }, origin: [0.5, 0.5], measured: { width: 80, height: 40 }, data: {} },
  ], edges: [] }));
  const placementsAt = (x, y) => buildBoardContext(workspace, workspace.boards[0].id, {
    region: { x, y, width: 1, height: 1 },
  }).placements;
  assert.deepEqual(placementsAt(60, 80).map(node => node.id), ['center']);
  assert.deepEqual(placementsAt(139, 119)[0].position, { x: 100, y: 100 });
  assert.deepEqual(placementsAt(59, 80), []);
  assert.deepEqual(placementsAt(60, 120), []);
  assert.deepEqual(placementsAt(140, 100), []);
});

test('only region context excludes hidden legacy placements, their links and explicitly hidden links', () => {
  const node = (id, hidden) => ({ id, position: { x: 0, y: 0 }, data: { label: id }, hidden });
  const workspace = migrateLegacyBoard(JSON.stringify({
    nodes: [node('a', false), node('b', false), node('c', true)],
    edges: [
      { id: 'shown', source: 'a', target: 'b' },
      { id: 'hidden', source: 'a', target: 'b', hidden: true },
      { id: 'to-hidden', source: 'a', target: 'c' },
    ],
  }));
  const id = workspace.boards[0].id;
  const cropped = buildBoardContext(workspace, id, { region: { x: 0, y: 0, width: 10, height: 10 } });
  assert.deepEqual(cropped.placements.map(p => p.id), ['a', 'b']);
  assert.deepEqual(cropped.components.map(c => c.label), ['a', 'b']);
  assert.deepEqual(cropped.relationships.map(r => r.id), ['shown']);
  const whole = buildBoardContext(workspace, id);
  assert.deepEqual(whole.placements.map(p => p.id), ['a', 'b', 'c']);
  assert.deepEqual(whole.relationships.map(r => r.id), ['hidden', 'shown', 'to-hidden']);
});

test('region notes use their full bounds, export text only on opt-in and never read excluded content', () => {
  const workspace = fixture();
  const board = workspace.boards[0];
  const region = { x: 170.5, y: 197, width: 10, height: 10 };
  const preventRead = (owner, key) => Object.defineProperty(owner, key, {
    get() { assert.fail('Unexpected read of ' + key); },
  });
  preventRead(board.notes[1], 'text');
  preventRead(workspace.cards[0], 'data');
  preventRead(workspace.cards[1], 'data');
  preventRead(workspace.cards[2].data, 'sourceText');
  preventRead(workspace.cards[2], 'attachments');
  const cropped = includeNoteText => buildBoardContext(workspace, 'map', { region, includeNoteText });
  assert.deepEqual(cropped(false).notes, [{ id: 'z', position: { x: -12.5, y: 50 } }]);
  assert.equal(cropped('true').notes[0].text, undefined);
  assert.equal(cropped(true).notes[0].text, 'private note');
  region.x = 171.5;
  assert.deepEqual(cropped(true).notes, []);
  region.x = 170.5;
  region.y = 198;
  assert.deepEqual(cropped(true).notes, []);
});

test('invalid rectangles never silently export whole-board context', () => {
  const workspace = fixture();
  const region = { x: -10, y: 2.75, width: 0.5, height: 4 };
  assert.equal(isContextRegion(region), true);
  for (const invalid of [null, {}, { ...region, x: NaN }, { ...region, y: Infinity },
    { ...region, width: 0 }, { ...region, height: -1 }, { ...region, height: '4' },
    { ...region, x: Number.MAX_VALUE, width: Number.MAX_VALUE }, { ...region, x: 1e30, width: 1 }]) {
    assert.equal(isContextRegion(invalid), false);
    assert.throws(() => buildBoardContext(workspace, 'map', { region: invalid }), /valid rectangular region/);
  }
});
