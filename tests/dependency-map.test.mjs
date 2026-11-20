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
 assert.deepEqual(result.diagnostics.map(item => item.reason), ['ambiguous local import', 'unresolved local import', 'non-relative dynamic import not analyzed']);
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

test('TypeScript emitted extensions resolve conservatively and unsupported forms are reported', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = [
   "import { x } from './a.js';",
   "import React from 'react';",
   "const dynamic = import('./b.js');",
   "const common = require('./b.js');",
 ].join('\n');
 let result = suggestDependencies(workspace, 'b');
 assert.equal(result.suggestions.length, 2);
 assert.equal(result.suggestions[0].targetPath, 'repo/src/a.ts');
 assert.equal(result.suggestions[0].specifier, './a.js');
 assert.deepEqual(result.diagnostics.map(item => item.reason), [
   'non-relative import not analyzed', 'require call not analyzed',
 ]);
 workspace.cards.push({ id: 'js', data: { kind: 'file', path: 'repo/src/a.js', label: 'a.js' } });
 workspace.boards[0].nodes.push({ id: 'js-node', cardId: 'js', position: { x: 2, y: 2 } });
 result = suggestDependencies(workspace, 'b');
 assert.equal(result.suggestions.length, 1);
 assert.equal(result.suggestions[0].importKind, 'dynamic');
 assert.ok(result.diagnostics.some(item => item.reason === 'ambiguous local import' && item.specifier === './a.js'));
});

test('diagnostics are bounded for large imports', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = Array.from({ length: 251 }, (_, i) => "import './missing" + i + "';").join('\n');
 assert.throws(() => suggestDependencies(workspace, 'b'), /Too many import diagnostics/);
});

test('literal dynamic imports produce distinct provenance without executing source', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = [
   "const later = import('./a');",
   "const also = import('./b.js');",
   "const unknown = import(variable);",
   "const packageModule = import('react');",
   "// import('./dup')",
 ].join('\n');
 const original = structuredClone(workspace);
 const result = suggestDependencies(workspace, 'b');
 assert.deepEqual(result.suggestions.map(({ targetPath, line, importKind }) => ({ targetPath, line, importKind })), [
   { targetPath: 'repo/src/a.ts', line: 1, importKind: 'dynamic' },
   { targetPath: 'repo/src/b.js', line: 2, importKind: 'dynamic' },
 ]);
 assert.deepEqual(result.diagnostics.map(item => item.reason), ['dynamic import expression not analyzed', 'non-relative dynamic import not analyzed']);
 let id = 0;
 const next = addSuggestedDependencies(workspace, 'b', result.suggestions, () => 'dynamic-' + ++id);
 assert.deepEqual(next.boards[0].edges.map(edge => edge.label), ['dynamic import', 'dynamic import']);
 assert.equal(next.boards[0].edges[0].data.importKind, 'dynamic');
 assert.deepEqual(workspace, original);
});

test('static relationship takes precedence when a pair is also dynamically imported', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = "const later = import('./a');\nimport './a';";
 const result = suggestDependencies(workspace, 'b');
 assert.equal(result.suggestions.length, 1);
 assert.equal(result.suggestions[0].importKind, 'static');
 assert.equal(result.suggestions[0].line, 2);
});

test('ambiguous imports report explicit candidates without selecting a target', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = "import './dup';";
 const original = structuredClone(workspace);
 const result = suggestDependencies(workspace, 'b');
 assert.equal(result.suggestions.length, 0);
 assert.equal(result.diagnostics.length, 1);
 const diagnostic = result.diagnostics[0];
 assert.equal(diagnostic.reason, 'ambiguous local import');
 assert.equal(diagnostic.sourceNodeId, 'n0');
 assert.equal(diagnostic.importKind, 'static');
 assert.deepEqual(diagnostic.candidates.map(item => item.targetPath).sort(), ['repo/src/dup.js', 'repo/src/dup.ts']);
 assert.deepEqual(workspace, original);
});

test('ambiguous duplicate placements distinguish already-connected targets', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = "import './a';";
 workspace.boards[0].nodes.push({ id: 'other-a', cardId: 'c1', position: { x: 4, y: 5 } });
 workspace.boards[0].edges.push({ id: 'existing', source: 'n0', target: 'n1' });
 const result = suggestDependencies(workspace, 'b');
 assert.equal(result.suggestions.length, 0);
 assert.deepEqual(result.diagnostics[0].candidates.map(item => ({ id: item.targetNodeId, connected: item.alreadyConnected })), [
   { id: 'n1', connected: true }, { id: 'other-a', connected: false },
 ]);
});

test('too many ambiguous placements are reported without a truncated choice list', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = "import './a';";
 for (let i = 0; i < 25; i++) workspace.boards[0].nodes.push({ id: 'copy-' + i, cardId: 'c1', position: { x: i, y: 0 } });
 const result = suggestDependencies(workspace, 'b');
 assert.match(result.diagnostics[0].reason, /more than 25 candidate placements/);
 assert.equal(result.diagnostics[0].candidates, undefined);
 assert.equal(result.suggestions.length, 0);
});

test('type-only imports and re-exports are labeled separately from runtime imports', () => {
 const workspace = fixture();
 workspace.cards.push({ id: 'only', data: { kind: 'file', path: 'repo/src/only.js', label: 'only.js' } });
 workspace.boards[0].nodes.push({ id: 'only-node', cardId: 'only', position: { x: 1, y: 2 } });
 workspace.cards[0].data.sourceText = [
   "import type { A } from './a';",
   "export { type B } from './b.js';",
   "import { type X, value } from './only.js';",
 ].join('\n');
 const result = suggestDependencies(workspace, 'b');
 assert.deepEqual(result.suggestions.map(item => [item.targetPath, item.importKind]), [
   ['repo/src/a.ts', 'type'],
   ['repo/src/b.js', 'type'],
   ['repo/src/only.js', 'static'],
 ]);
 let id = 0;
 const updated = addSuggestedDependencies(workspace, 'b', result.suggestions, () => 'e-' + ++id);
 assert.deepEqual(updated.boards[0].edges.map(edge => edge.label), ['type import', 'type import', 'imports']);
 assert.equal(updated.boards[0].edges[0].data.importKind, 'type');
});

test('runtime relationships take precedence over type-only relationships for the same pair', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = [
   "import type { A } from './a';",
   "const deferred = import('./a');",
   "import { value } from './a';",
 ].join('\n');
 const result = suggestDependencies(workspace, 'b');
 assert.equal(result.suggestions.length, 1);
 assert.equal(result.suggestions[0].importKind, 'static');
 assert.equal(result.suggestions[0].line, 3);
 workspace.cards[0].data.sourceText = "import type { A } from './a';\nconst deferred = import('./a');";
 const dynamic = suggestDependencies(workspace, 'b');
 assert.equal(dynamic.suggestions.length, 1);
 assert.equal(dynamic.suggestions[0].importKind, 'dynamic');
});

test('ambiguous type-only imports preserve their kind for explicit resolution', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = "import type { D } from './dup';";
 const result = suggestDependencies(workspace, 'b');
 assert.equal(result.suggestions.length, 0);
 assert.equal(result.diagnostics[0].importKind, 'type');
 assert.equal(result.diagnostics[0].candidates.length, 2);
});

test('TypeScript import-equals is distinguished from arbitrary require calls', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = [
   "import A = require('./a');",
   "import type B = require('./b.js');",
   "const shadowed = require('./b.js');",
   "import Package = require('outside');",
 ].join('\n');
 const result = suggestDependencies(workspace, 'b');
 assert.deepEqual(result.suggestions.map(item => [item.targetPath, item.importKind, item.line]), [
   ['repo/src/a.ts', 'require', 1],
   ['repo/src/b.js', 'type', 2],
 ]);
 assert.ok(result.diagnostics.some(item => item.reason === 'non-relative import not analyzed' && item.specifier === 'outside'));
 assert.ok(result.diagnostics.some(item => item.reason === 'require call not analyzed' && item.specifier === './b.js'));
 let id = 0;
 const next = addSuggestedDependencies(workspace, 'b', result.suggestions, () => 'require-' + ++id);
 assert.deepEqual(next.boards[0].edges.map(edge => edge.label), ['require import', 'type import']);
 assert.equal(next.boards[0].edges[0].data.importKind, 'require');
});

test('ambiguous TypeScript import-equals preserves its import kind', () => {
 const workspace = fixture();
 workspace.cards[0].data.sourceText = "import D = require('./dup');";
 const result = suggestDependencies(workspace, 'b');
 assert.equal(result.suggestions.length, 0);
 assert.equal(result.diagnostics[0].importKind, 'require');
 assert.equal(result.diagnostics[0].candidates.length, 2);
});
