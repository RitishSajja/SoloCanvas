import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateContext } from '../mcp/validate-context.mjs';
import { connectedPlacementContext } from '../src/connected-context.mjs';
import { buildBoardContext } from '../src/spatial-context.mjs';
import { validateWorkspace } from '../src/workspace.mjs';

const workspace = {
  version: 3,
  cards: [{ id: '__proto__', data: { kind: 'file', label: 'API', path: 'src/api.ts', sourceText: 'private' } },
    { id: 'db', data: { label: 'Database' } }],
  boards: [{ id: 'parent', title: 'Project', parentPlacement: null, extra: {}, notes: [], edges: [],
    nodes: [{ id: 'map-link', cardId: 'db', position: { x: 0, y: 0 }, shape: 'rounded' }] },
    { id: 'map', title: 'Diagram', extra: {}, parentPlacement: { boardId: 'parent', nodeId: 'map-link' },
      nodes: [
        { id: 'a', cardId: '__proto__', position: { x: 0, y: -2 }, shape: 'diamond', measured: { width: 30, height: 22 } },
        { id: 'b', cardId: 'db', position: { x: 45, y: 0 }, shape: 'pill', fileMissing: true },
        { id: 'c', cardId: 'db', position: { x: 1000, y: 0 }, shape: 'rectangle' },
      ],
      edges: [
        { id: 'e', source: 'a', target: 'b', data: { sourcePath: 'src/api.ts', targetPath: 'src/db.ts',
          specifier: './db', line: 1, importKind: 'type' } },
        { id: 'f', source: 'a', target: 'a' },
      ],
      notes: [{ id: 'n', position: { x: 20, y: 0 }, text: 'Important' },
        { id: 'o', position: { x: 1000, y: 0 }, text: 'Outside' }],
    },
    { id: 'child', title: 'Nested', extra: {}, parentPlacement: { boardId: 'map', nodeId: 'b' }, nodes: [], notes: [], edges: [] }],
};
const whole = () => buildBoardContext(workspace, 'map', { includeNoteText: true });
const connected = () => connectedPlacementContext(whole(), 'a');
const region = () => buildBoardContext(workspace, 'map', { region: { x: -5, y: -5, width: 75, height: 30 } });

test('accepts real whole-board, region, connected and empty-board exports', () => {
  assert.equal(validateWorkspace(workspace), true);
  for (const original of [whole(), region(), connected(), buildBoardContext(workspace, 'child')]) {
    const snapshot = JSON.parse(JSON.stringify(original));
    assert.equal(validateContext(snapshot), snapshot);
    assert.deepEqual(snapshot, original);
  }
});

function rejects(make, edits) {
  for (const edit of edits) {
    const value = make();
    edit(value);
    assert.throws(() => validateContext(value), { message: 'Invalid SoloCanvas board-context export.' }, String(edit));
  }
}

test('rejects fields outside the export allowlist at every nesting level', () => {
  rejects(whole, [
    value => { value.attachments = ['private']; },
    value => { value.board.extra = { description: 'private' }; },
    value => { value.board.parentPlacement.path = 'private'; },
    value => { value.scope.path = 'private'; },
    value => { value.components[0].sourceText = 'private'; },
    value => { value.components[1].path = 'private'; },
    value => { value.placements[0].attachments = []; },
    value => { value.placements[0].position.z = 'private'; },
    value => { value.placements[0].size.original = 'private'; },
    value => { value.relationships[0].evidence.unknown = 'private'; },
    value => { value.relationships[1].evidence = value.relationships[0].evidence; },
    value => { Object.defineProperty(value.notes[0], '__proto__', { value: 'private', enumerable: true }); },
    value => { value.notes[0].position.extra = 'private'; },
  ]);
});

test('rejects unsupported versions, missing fields, invalid evidence and inconsistent identities', () => {
  for (const value of [null, [], 'private', workspace, { version: 1 }]) {
    assert.throws(() => validateContext(value), { message: 'Invalid SoloCanvas board-context export.' });
  }
  rejects(whole, [
    value => { value.format = 'solocanvas.workspace'; },
    value => { value.version = 2; },
    value => { delete value.board.parentPlacement; },
    value => { value.components.push({ id: 'other', label: 'Other', kind: 'component' }); },
    value => { value.components[0].label = { private: true }; },
    value => { value.placements[0].shape = 'unknown'; },
    value => { value.placements[0].position.x = Infinity; },
    value => { value.placements[0].size.height = 0; },
    value => { value.placements[0].id = ''; },
    value => { value.placements[0].componentId = 'missing'; },
    value => { value.placements[1].miniBoardId = value.board.id; },
    value => { value.relationships[0].sourcePlacementId = 'missing'; },
    value => { value.relationships[0].evidence.line = 1.1; },
    value => { value.relationships[0].evidence.importKind = 'arbitrary'; },
    value => { delete value.relationships[0].evidence; },
    value => { value.relationships[1].id = value.relationships[0].id; },
    value => { value.notes[0].id = value.placements[0].id; },
    value => { delete value.notes[0].text; },
  ]);
});

test('rejects invalid bounds, disconnected placements and notes outside the chosen scope', () => {
  rejects(region, [
    value => { value.scope.width = 0; },
    value => { value.scope.x = Number.MAX_VALUE; },
    value => { value.notes[0].position.x = 70; },
  ]);
  rejects(connected, [
    value => { delete value.scope.placementId; },
    value => { value.scope.placementId = 'not present'; },
    value => { value.notes = whole().notes; },
    value => { value.placements = whole().placements; },
  ]);
});
