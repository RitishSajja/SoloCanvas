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
