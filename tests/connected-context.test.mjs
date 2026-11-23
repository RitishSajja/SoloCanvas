import test from 'node:test';
import assert from 'node:assert/strict';
import { connectedPlacementContext } from '../src/connected-context.mjs';

const components = ['api', 'db', 'jobs', 'log'].map(id => ({ id, label: id, kind: 'component' }));
const placements = [['a', 'api'], ['b', 'jobs'], ['c', 'db'], ['d', 'api'], ['e', 'log']].map(([id, componentId]) =>
  ({ id, componentId, position: { x: 0, y: 0 }, shape: 'pill' }));
const relationships = [['1', 'b', 'a'], ['2', 'b', 'c'], ['3', 'c', 'a'], ['4', 'a', 'a'], ['5', 'd', 'e']].map(
  ([id, sourcePlacementId, targetPlacementId]) => ({ id, sourcePlacementId, targetPlacementId, kind: 'manual', label: id }));
const context = {
  format: 'solocanvas.board-context', version: 1, scope: { kind: 'board' },
  board: { id: 'board', title: 'System', parentPlacement: null }, components, placements, relationships,
  notes: [{ id: 'n', position: { x: 0, y: 0 }, text: 'Board-wide note' }],
};
test('connected scope follows either direction through cycles and retains each relationship once', () => {
  const original = structuredClone(context);
  const result = connectedPlacementContext(context, 'a');
  assert.deepEqual(result.scope, { kind: 'connected-placements', placementId: 'a' });
  assert.deepEqual(result.placements.map(p => p.id), ['a', 'b', 'c']);
  assert.deepEqual(result.components.map(c => c.id), ['api', 'db', 'jobs']);
  assert.deepEqual(result.relationships.map(e => e.id), ['1', '2', '3', '4']);
  assert.deepEqual(result.notes, []);
  assert.deepEqual(context, original);
});
test('an isolated placement stays distinct from other appearances and a missing anchor fails closed', () => {
  const unlinked = { ...context, relationships: [] };
  assert.deepEqual(connectedPlacementContext(unlinked, 'd').placements, [placements[3]]);
  assert.deepEqual(connectedPlacementContext(unlinked, 'd').relationships, []);
  assert.throws(() => connectedPlacementContext(context, 'missing'), /select a placement/i);
});
