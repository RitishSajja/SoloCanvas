import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardAnalysisSnapshot, startDependencyAnalysis } from '../src/analysis-client.mjs';

const workspace = {
 version: 2,
 cards: [{ id: 'shown', data: { label: 'Visible' } }, { id: 'hidden', data: { sourceText: 'other board' } }, { id: 'orphan', data: { label: 'Unused' } }],
 boards: [
  { id: 'one', title: 'One', extra: {}, nodes: [{ id: 'n', cardId: 'shown', position: { x: 0, y: 0 } }], edges: [] },
  { id: 'two', title: 'Two', extra: {}, nodes: [{ id: 'm', cardId: 'hidden', position: { x: 0, y: 0 } }], edges: [] },
 ],
};

test('analysis receives only an independent copy of the selected board and its cards', () => {
 const result = boardAnalysisSnapshot(workspace, 'one');
 assert.deepEqual(result.cards.map(card => card.id), ['shown']);
 assert.deepEqual(result.boards.map(board => board.id), ['one']);
 result.cards[0].data.label = 'changed';
 assert.equal(workspace.cards[0].data.label, 'Visible');
 assert.throws(() => boardAnalysisSnapshot(workspace, 'missing'));
});

test('analysis cancellation terminates the worker and rejects once', async () => {
 const original = globalThis.Worker; let instance;
 globalThis.Worker = class {
   constructor() { instance = this; }
   postMessage(value) { this.payload = value; }
   terminate() { this.terminated = true; }
 };
 try {
   const task = startDependencyAnalysis(workspace, 'one');
   assert.deepEqual(instance.payload.workspace.cards.map(card => card.id), ['shown']);
   task.cancel(); task.cancel();
   await assert.rejects(task.promise, { name: 'AbortError' });
   assert.equal(instance.terminated, true);
 } finally { globalThis.Worker = original; }
});

test('worker errors are reported without mutating the workspace', async () => {
 const original = globalThis.Worker; let instance;
 globalThis.Worker = class {
   constructor() { instance = this; }
   postMessage() {}
   terminate() { this.terminated = true; }
 };
 try {
   const before = structuredClone(workspace);
   const task = startDependencyAnalysis(workspace, 'one');
   instance.onerror();
   await assert.rejects(task.promise, /worker failed/);
   assert.equal(instance.terminated, true);
   assert.deepEqual(workspace, before);
 } finally { globalThis.Worker = original; }
});
