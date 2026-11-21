import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportBoardMermaid } from '../src/mermaid-export.mjs';
import { parseMermaidFlowchart } from '../src/mermaid-import.mjs';
import { migrateWorkspaceV2 } from '../src/workspace.mjs';

const sourceWorkspace = migrateWorkspaceV2({
  version: 2,
  cards: [
    { id: 'api', data: { label: 'API "gateway" | service' } },
    { id: 'db', data: { label: 'Database 😃\nreplica' } },
  ],
  boards: [{
    id: 'board', title: 'Architecture', extra: {}, nodes: [
      { id: 'api-placement', cardId: 'api', position: { x: 10, y: 20 } },
      { id: 'db-placement', cardId: 'db', position: { x: 400, y: 20 } },
    ], edges: [{ id: 'reads', source: 'api-placement', target: 'db-placement', label: 'reads | writes' }],
  }],
});

test('parses the exact exported syntax and preserves escaped label text', () => {
  const diagram = exportBoardMermaid(sourceWorkspace, 'board');
  assert.deepEqual(parseMermaidFlowchart(diagram), {
    nodes: [
      { id: 'n0', label: 'API "gateway" | service' },
      { id: 'n1', label: 'Database 😃\nreplica' },
    ],
    edges: [{ source: 'n0', target: 'n1', label: 'reads | writes' }],
  });
  assert.deepEqual(parseMermaidFlowchart(diagram.replace(/\n/g, '\r\n')), parseMermaidFlowchart(diagram));
});

test('preserves repeated directed relationships in input order and requires defined nodes first', () => {
  const diagram = parseMermaidFlowchart([
    'flowchart LR',
    '  n0["A"]',
    '  n1["B"]',
    '  n0 -->|first| n1',
    '  n0 --> n1',
    '  n0 -->|last| n1',
  ].join('\n'));
  assert.deepEqual(diagram.edges, [
    { source: 'n0', target: 'n1', label: 'first' },
    { source: 'n0', target: 'n1', label: '' },
    { source: 'n0', target: 'n1', label: 'last' },
  ]);
});

test('preserves escaped NUL and newline code points as inert label text', () => {
  const diagram = parseMermaidFlowchart([
    'flowchart LR',
    '  n0["before#0;middle#10;after"]',
    '  n1["target"]',
    '  n0 -->|line#10;break| n1',
  ].join('\n'));
  assert.equal(diagram.nodes[0].label, 'before\u0000middle\nafter');
  assert.equal(diagram.edges[0].label, 'line\nbreak');
});

test('rejects unsupported syntax, duplicate or nonsequential IDs, and unknown references with line numbers', () => {
  const badDiagrams = [
    ['flowchart TD', '  n0["A"]'],
    ['flowchart LR', '  n0["A"]', '  n0["B"]'],
    ['flowchart LR', '  n1["A"]'],
    ['flowchart LR', '  n0 --> n1', '  n0["A"]', '  n1["B"]'],
    ['flowchart LR', '  n0["A"]', '  n0 --> n4'],
    ['flowchart LR', '  n0["A"]', '  %%{init: {"theme":"dark"}}%%'],
    ['flowchart LR', '  n0["A"]', '  click n0 "https://example.test"'],
    ['flowchart LR', '  n0["<img src=x>"]'],
    ['flowchart LR', '  n0["A"]', '  subgraph private'],
  ];
  for (const lines of badDiagrams) {
    assert.throws(() => parseMermaidFlowchart(lines.join('\n')), /Line \d+:/);
  }
});

test('rejects malformed, non-scalar and raw special-character escapes', () => {
  for (const label of ['#;', '#01;', '#1114112;', '#55296;', '#34', 'unescaped "quote"', 'non-ascii é']) {
    assert.throws(() => parseMermaidFlowchart(`flowchart LR\n  n0["${label}"]`), /Line 2:/);
  }
  assert.throws(() => parseMermaidFlowchart('flowchart LR\r  n0["A"]'), /Line 1: Only LF or CRLF/);
});

test('enforces input, line, node, relationship and decoded label limits', () => {
  assert.throws(() => parseMermaidFlowchart('x'.repeat(5 * 1024 * 1024 + 1)), /exceeds 5 MiB/);
  assert.throws(() => parseMermaidFlowchart('界'.repeat(Math.floor(5 * 1024 * 1024 / 3) + 1)), /exceeds 5 MiB/);
  assert.throws(() => parseMermaidFlowchart(`flowchart LR\n  n0["${'a'.repeat(513)}"]`), /512 characters/);
  assert.throws(() => parseMermaidFlowchart('flowchart LR\n' +
    Array.from({ length: 1001 }, (_, index) => `  n${index}["A"]`).join('\n')), /1000 components/);
  assert.throws(() => parseMermaidFlowchart('flowchart LR\n  n0["A"]\n' +
    Array.from({ length: 3001 }, () => '  n0 --> n0').join('\n')), /3000 relationships/);
  assert.throws(() => parseMermaidFlowchart('flowchart LR\n' + ' '.repeat(5001)), /Line 2: Line exceeds 5000/);
});
