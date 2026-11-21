import { test, expect } from '@playwright/test';
import { openWorkspaceBoard } from './workspace-helpers.mjs';

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

test('edits made while a save waits for the lock remain unsaved and can be saved afterwards', async ({ page }) => {
 await page.goto('/');
 await openWorkspaceBoard(page);
 await page.getByRole('button', { name: 'Add component' }).click();
 await page.locator('.react-flow__node').first().click();
 await page.getByLabel('Shared component name').fill('Initial');
 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('Workspace saved');

 await page.evaluate(() => new Promise(resolve => {
   navigator.locks.request('solocanvas.workspace.v2.write', async () => {
     await new Promise(release => { window.releaseWorkspaceTestLock = release; resolve(); });
   });
 }));
 await page.getByLabel('Shared component name').fill('Snapshot at save');
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('button', { name: 'Save workspace' })).toBeDisabled();
 await page.getByLabel('Shared component name').fill('Newer unsaved edit');
 await page.evaluate(() => window.releaseWorkspaceTestLock());
 await expect(page.getByRole('status')).toContainText('Newer changes remain unsaved');
 expect(await page.evaluate(() => JSON.parse(localStorage.getItem('solocanvas.workspace.v2')).cards[0].data.label)).toBe('Snapshot at save');
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solocanvas.workspace.v2')).cards[0].data.label)).toBe('Newer unsaved edit');
 await expect(page.getByRole('status')).toContainText('Workspace saved');
});

test('workspace quota failure preserves the saved data and permits retry', async ({ page }) => {
 await page.goto('/');
 await openWorkspaceBoard(page);
 await page.getByRole('button', { name: 'Add component' }).click();
 await page.locator('.react-flow__node').first().click();
 await page.getByLabel('Shared component name').fill('Previously saved');
 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('Workspace saved');
 const previous = await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'));
 await page.getByLabel('Shared component name').fill('Unsaved after quota error');
 await page.evaluate(() => {
   window.restoreWorkspaceStorage = Storage.prototype.setItem;
   Storage.prototype.setItem = function(key, value) {
     if (key === 'solocanvas.workspace.v2') throw new DOMException('Quota exceeded', 'QuotaExceededError');
     return window.restoreWorkspaceStorage.call(this, key, value);
   };
 });
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('could not be saved');
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBe(previous);
 await expect(page.getByLabel('Shared component name')).toHaveValue('Unsaved after quota error');
 await page.evaluate(() => { Storage.prototype.setItem = window.restoreWorkspaceStorage; });
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('solocanvas.workspace.v2')).cards[0].data.label)).toBe('Unsaved after quota error');
});
