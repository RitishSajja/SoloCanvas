import { test, expect } from '@playwright/test';

test('cooperating tabs serialize v2 saves and reject a stale snapshot', async ({ context }) => {
 const first = await context.newPage();
 const second = await context.newPage();
 await first.goto('/');
 await second.goto('/');
 const open = () => import('/src/workspace-storage.mjs').then(module => module.openWorkspace());
 const a = await first.evaluate(open);
 const b = await second.evaluate(open);
 expect(a.ok).toBe(true); expect(b.ok).toBe(true);
 a.workspace.boards[0].title = 'first';
 b.workspace.boards[0].title = 'second';
 const save = async ({ workspace, snapshot }) => {
   const module = await import('/src/workspace-storage.mjs');
   return module.writeWorkspaceLocked(workspace, snapshot);
 };
 const results = await Promise.all([first.evaluate(save, a), second.evaluate(save, b)]);
 expect(results.filter(result => result.ok)).toHaveLength(1);
 expect(results.find(result => !result.ok).error).toContain('changed');
 const stored = await first.evaluate(open);
 expect(['first', 'second']).toContain(stored.workspace.boards[0].title);
});

test('cooperating v1 and v2 tabs do not both save from an empty snapshot', async ({ context }) => {
 const first = await context.newPage();
 const second = await context.newPage();
 await first.goto('/');
 await second.goto('/');
 const oldState = await first.evaluate(async () => (await import('/src/storage.mjs')).loadBoard());
 const newState = await second.evaluate(async () => (await import('/src/workspace-storage.mjs')).openWorkspace());
 expect(newState.ok).toBe(true);
 const [oldResult, newResult] = await Promise.all([
   first.evaluate(async ({ raw }) => (await import('/src/storage.mjs')).saveBoardSafely({ nodes: [], edges: [] }, undefined, raw), oldState),
   second.evaluate(async ({ workspace, snapshot }) => (await import('/src/workspace-storage.mjs')).writeWorkspaceLocked(workspace, snapshot), newState),
 ]);
 expect(Number(oldResult === 'Saved on this device') + Number(newResult.ok)).toBe(1);
 const saved = await first.evaluate(() => ({ v1: localStorage.getItem('solocanvas.board.v1'), v2: localStorage.getItem('solocanvas.workspace.v2') }));
 expect(Number(saved.v1 !== null) + Number(saved.v2 !== null)).toBe(1);
});
