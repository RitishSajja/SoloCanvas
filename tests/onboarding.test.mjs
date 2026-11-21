import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoard } from '../src/storage.mjs';
import { createExampleBoard } from '../src/example-board.mjs';

test('the example is a valid, connected local-first architecture board', () => {
  const board = createExampleBoard();
  const nodeIds = new Set(board.nodes.map(node => node.id));
  assert.equal(parseBoard(JSON.stringify(board)) !== null, true);
  assert.equal(board.nodes.length, 8);
  assert.equal(board.edges.length, 7);
  assert.equal(nodeIds.size, board.nodes.length);
  assert.ok(board.nodes.some(node => node.data.label === 'Local analysis worker'));
  assert.ok(board.nodes.some(node => node.data.label === 'Backup & recovery'));
  assert.ok(board.edges.every(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.label));
  assert.ok(board.nodes.every(node => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)));
});
