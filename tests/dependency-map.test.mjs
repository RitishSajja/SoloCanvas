import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestDependencies, addSuggestedDependencies } from '../src/dependency-map.mjs';

function fixture() {
 const paths = ['repo/src/main.ts', 'repo/src/a.ts', 'repo/src/b.js', 'repo/src/dup.ts', 'repo/src/dup.js'];
 const cards = paths.map((path, i) => ({ id: 'c' + i, data: { kind: 'file', path, label: path } }));
 cards[0].data.sourceText = [
   "// import './fake'",
   "import type { A } from './a';",
   "export { b } from './b.js';",
   "import './dup';",
   "import './missing';",
   "import('external');",
   "const text = \"import './nope'\";",
 ].join('\n');
 return { version: 2, cards, boards: [{ id: 'b', title: 'Files', extra: {},
   nodes: cards.map((card, i) => ({ id: 'n' + i, cardId: card.id, position: { x: i * 10, y: 0 } })), edges: [] }] };
}

test('suggests only unambiguous static local imports with source evidence', () => {
 const workspace = fixture(); const original = structuredClone(workspace);
 const result = suggestDependencies(workspace, 'b');
 assert.deepEqual(result.suggestions.map(({ targetPath, specifier, line }) => ({ targetPath, specifier, line })), [
   { targetPath: 'repo/src/a.ts', specifier: './a', line: 2 },
   { targetPath: 'repo/src/b.js', specifier: './b.js', line: 3 },
 ]);
 assert.deepEqual(result.diagnostics.map(item => item.reason), ['ambiguous local import', 'unresolved local import']);
 assert.deepEqual(workspace, original);
 let id = 0;
 const applied = addSuggestedDependencies(workspace, 'b', result.suggestions, () => 'edge-' + ++id);
 assert.equal(applied.boards[0].edges.length, 2);
 assert.equal(applied.boards[0].edges[0].data.line, 2);
 assert.deepEqual(workspace, original);
 assert.deepEqual(suggestDependencies(applied, 'b').suggestions, []);
});

test('skips ambiguous placements and syntax errors, and refuses excessive input', () => {
 const workspace = fixture();
 workspace.boards[0].nodes.push({ id: 'duplicate', cardId: 'c1', position: { x: 2, y: 2 } });
 workspace.cards[2].data.sourceText = 'import {';
 const result = suggestDependencies(workspace, 'b');
 assert.equal(result.suggestions.some(item => item.targetPath === 'repo/src/a.ts'), false);
 assert.ok(result.diagnostics.some(item => item.reason === 'ambiguous local import'));
 assert.ok(result.diagnostics.some(item => item.reason === 'source could not be parsed'));
 const tooLarge = fixture(); tooLarge.cards[0].data.sourceText = 'x'.repeat(512 * 1024 + 1);
 assert.throws(() => suggestDependencies(tooLarge, 'b'), /512 KiB/);
 assert.throws(() => addSuggestedDependencies(workspace, 'b', [{ sourceNodeId: 'bad' }], () => 'edge'));
});
