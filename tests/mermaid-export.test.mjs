import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportBoardMermaid } from '../src/mermaid-export.mjs';

const workspace = {
 version: 2,
 cards: [
  { id: 'shared', data: { label: 'API "public"', sourceText: 'PRIVATE SOURCE' } },
  { id: 'db', data: { label: 'DB | cache' } },
 ],
 boards: [
  { id: 'b', title: 'Board', extra: {}, nodes: [
   { id: 'same', cardId: 'shared', position: { x: 1, y: 2 } },
   { id: 'copy', cardId: 'shared', position: { x: 5, y: 6 } },
   { id: 'db-node', cardId: 'db', position: { x: 9, y: 10 } },
  ], edges: [{ id: 'e', source: 'copy', target: 'db-node', label: 'reads | writes' }] },
  { id: 'other', title: 'Other', extra: {}, nodes: [], edges: [] },
 ],
};

test('exports board placements and directed labels without source or metadata', () => {
 const before = structuredClone(workspace);
 const result = exportBoardMermaid(workspace, 'b');
 assert.equal(result, 'flowchart LR\n  n0["API #34;public#34;"]\n  n1["API #34;public#34;"]\n  n2["DB #124; cache"]\n  n1 -->|reads #124; writes| n2\n');
 assert.equal(result.includes('PRIVATE SOURCE'), false);
 assert.deepEqual(workspace, before);
 assert.equal(exportBoardMermaid(workspace, 'other'), 'flowchart LR\n');
});

test('escapes directive and newline injection and rejects oversized labels', () => {
 const input = structuredClone(workspace);
 input.cards[0].data.label = 'A"]\nclick n0 "https://example.com"';
 const result = exportBoardMermaid(input, 'b');
 assert.match(result, /#34;#93;#10;click/);
 assert.equal(result.split('\n').length, 6);
 input.cards[0].data.label = 'x'.repeat(513);
 assert.throws(() => exportBoardMermaid(input, 'b'), /512 characters/);
 assert.throws(() => exportBoardMermaid(workspace, 'missing'), /not found/);
});
