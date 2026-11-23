import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateWorkspaceV2 } from '../src/workspace.mjs';
import { suggestDependencies } from '../src/dependency-map.mjs';
import { addSuggestedDependencies } from '../src/dependency-apply.mjs';
import { prepareRefreshAnalysis, previewDependencyRefresh, applyDependencyRefresh, isInferredDependency } from '../src/refresh-dependencies.mjs';

const source = 'app/main.ts';
function fixture() {
  const paths = [source, 'app/old.ts', 'app/new.ts', 'app/stable.ts', 'app/shared.ts', 'app/manual.ts'];
  const cards = paths.map((path, i) => ({ id: 'c' + i, data: { kind: 'file', path, label: path } }));
  cards[0].data.sourceText = "import './old';\nimport './stable';\nimport './shared';\nimport './manual';";
  const board = { id: 'b', title: 'Project', extra: {}, nodes: cards.map((card, i) =>
    ({ id: 'n' + i, cardId: card.id, position: { x: i * 250, y: 50 } })),
    edges: [{ id: 'manual', source: 'n0', target: 'n5', label: 'Maintained by hand', data: { custom: 42 } }] };
  const workspace = migrateWorkspaceV2({ version: 2, cards, boards: [board] });
  const { suggestions } = suggestDependencies(workspace, 'b');
  let id = 0;
  return addSuggestedDependencies(workspace, 'b', suggestions, () => 'i' + ++id);
}
function review(workspace, contents) {
  const input = prepareRefreshAnalysis(workspace, 'b', contents);
  return previewDependencyRefresh(workspace, 'b', contents, suggestDependencies(input, 'b'));
}

test('reviews only accepted import changes with line evidence and preserves manual links and custom labels', () => {
  const workspace = fixture();
  const board = workspace.boards[0];
  board.edges.find(edge => edge.target === 'n3').label = 'Do not rename me';
  const old = structuredClone(workspace);
  const text = "// updated source\n\nimport type { S } from './stable';\nimport './new';\nimport './shared';\nimport './manual';";
  workspace.cards[0].data.sourceText = text;
  const changes = review(workspace, new Map([[source, text]]));
  assert.deepEqual(changes.map(item => [item.kind, item.evidence.targetNodeId, item.evidence.line]),
    [['updated', 'n3', 3], ['added', 'n2', 4], ['updated', 'n4', 5], ['removed', 'n1', 1]]);
  const selected = changes.filter(item => item.evidence.targetNodeId !== 'n4');
  const next = applyDependencyRefresh(workspace, 'b', changes, selected.map(item => item.key), () => 'next');
  const edges = next.boards[0].edges;
  assert.deepEqual(edges.find(edge => edge.id === 'manual'), old.boards[0].edges[0]);
  assert.equal(edges.some(edge => edge.target === 'n1'), false);
  assert.equal(edges.find(edge => edge.target === 'n2').id, 'next');
  const updated = edges.find(edge => edge.target === 'n3');
  assert.equal(updated.label, 'Do not rename me');
  assert.equal(updated.data.importKind, 'type');
  assert.equal(updated.id, old.boards[0].edges.find(edge => edge.target === 'n3').id);
  assert.deepEqual(edges.find(edge => edge.target === 'n4'), board.edges.find(edge => edge.target === 'n4'));
  assert.deepEqual(board, old.boards[0]);
  assert.throws(() => applyDependencyRefresh(next, 'b', changes, selected.map(item => item.key), () => 'again'), /stale/);
});

test('guards earlier file maps, incomplete source selection, ambiguous and missing placements', () => {
  const workspace = fixture();
  const text = workspace.cards[0].data.sourceText;
  assert.deepEqual(review(workspace, new Map()), []);
  assert.deepEqual(review(workspace, new Map([[source, 'unaccepted replacement']])), []);
  assert.equal(isInferredDependency(workspace.boards[0].edges[0]), false);
  const legacy = structuredClone(workspace.boards[0].edges[1]); delete legacy.data.importKind;
  assert.equal(isInferredDependency(legacy), true);
  for (const sample of ["import {", "import './unavailable';", "import(anyName)"]) {
    workspace.cards[0].data.sourceText = sample;
    assert.deepEqual(review(workspace, new Map([[source, sample]])), []);
  }
  workspace.cards[0].data.sourceText = text;
  workspace.boards[0].nodes[1].fileMissing = true;
  assert.deepEqual(review(workspace, new Map([[source, text]])), []);
  workspace.cards[0].data.sourceText = '';
  assert.deepEqual(review(workspace, new Map([[source, '']])).map(change => change.evidence.targetNodeId), ['n3', 'n4']);
  workspace.boards[0].nodes[0].fileMissing = true;
  assert.deepEqual(review(workspace, new Map([[source, '']])), []);
  workspace.boards[0].nodes[0].fileMissing = false;
  workspace.boards[0].nodes.push({ ...workspace.boards[0].nodes[0], id: 'source-copy' });
  assert.deepEqual(review(workspace, new Map([[source, '']])), []);
});

test('unresolved aliases preserve prior links while new relative imports can still be added', () => {
  const workspace = fixture();
  for (const alias of ["import '@app/old';", "import('@app/old');", "require('./old');"]) {
    const text = alias + "\nimport './new';";
    workspace.cards[0].data.sourceText = text;
    const changes = review(workspace, new Map([[source, text]]));
    assert.deepEqual(changes.map(item => [item.kind, item.evidence.targetNodeId]), [['added', 'n2']]);
  }
});

test('keeps duplicate and manual edge pairs and rejects a stale decision after manual replacement', () => {
  const workspace = fixture();
  const board = workspace.boards[0];
  workspace.cards[0].data.sourceText = '';
  board.edges.push({ ...board.edges.find(edge => edge.target === 'n1'), id: 'duplicate' });
  const cached = review(workspace, new Map([[source, '']]));
  assert.deepEqual(cached.map(item => item.evidence.targetNodeId), ['n3', 'n4']);
  const replacement = board.edges.find(edge => edge.target === 'n3');
  delete replacement.data;
  assert.throws(() => applyDependencyRefresh(workspace, 'b', cached, [cached[0].key], () => 'unused'), /stale/);
  assert.equal(board.edges.includes(replacement), true);
});
