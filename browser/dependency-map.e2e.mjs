import { test, expect } from '@playwright/test';

test('static import suggestions are reviewed, applied and saved explicitly', async ({ page }) => {
 test.setTimeout(60000);
 const workspace = {
   version: 2,
   cards: [
     { id: 'a', data: { kind: 'file', path: 'repo/main.ts', label: 'main.ts', sourceText: "import { value } from './service';\nimport './missing';" } },
     { id: 'b', data: { kind: 'file', path: 'repo/service.ts', label: 'service.ts', sourceText: 'export const value = 1;' } },
   ],
   boards: [{ id: 'board', title: 'Files', extra: {}, nodes: [
     { id: 'a-node', cardId: 'a', position: { x: 50, y: 50 } },
     { id: 'b-node', cardId: 'b', position: { x: 400, y: 50 } },
   ], edges: [] }],
 };
 await page.addInitScript(value => {
   if (!localStorage.getItem('solocanvas.workspace.v2')) localStorage.setItem('solocanvas.workspace.v2', JSON.stringify(value));
 }, workspace);
 await page.goto('/');
 await page.getByRole('button', { name: 'Open workspace' }).click();
 const panel = page.getByRole('region', { name: 'Import relationship suggestions' });
 await panel.getByRole('button', { name: 'Analyze board imports' }).click();
 await expect(panel).toContainText('1 relationship(s) suggested', { timeout: 20000 });
 await expect(panel).toContainText("repo/main.ts:1 imports ./service → repo/service.ts");
 await expect(panel).toContainText('unresolved local import');
 await expect(page.locator('.react-flow__edge')).toHaveCount(0);
 await page.locator('.react-flow__node').filter({ hasText: 'main.ts' }).click();
 await page.getByLabel('Shared component name').fill('renamed.ts');
 await expect(panel).toContainText('Workspace changed');
 await expect(panel.getByRole('button', { name: 'Add suggested relationships' })).toHaveCount(0);
 await panel.getByRole('button', { name: 'Analyze board imports' }).click();
 await expect(panel).toContainText('1 relationship(s) suggested', { timeout: 20000 });
 await panel.getByRole('button', { name: 'Add suggested relationships' }).click();
 await expect(page.locator('.react-flow__edge')).toHaveCount(1);
 const beforeSave = await page.evaluate(() => JSON.parse(localStorage.getItem('solocanvas.workspace.v2')));
 expect(beforeSave.boards[0].edges).toHaveLength(0);
 await page.locator('.react-flow__edge-interaction').click({ force: true });
 await expect(page.getByText(/Suggested from repo\/main.ts:1/)).toBeVisible();
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('Workspace saved');
 await page.reload(); await page.getByRole('button', { name: 'Open workspace' }).click();
 await expect(page.locator('.react-flow__edge')).toHaveCount(1);
 await page.locator('.react-flow__edge-interaction').click({ force: true });
 await expect(page.getByText(/Suggested from repo\/main.ts:1/)).toBeVisible();
 await panel.getByRole('button', { name: 'Analyze board imports' }).click();
 await expect(panel).toContainText('0 relationship(s) suggested', { timeout: 20000 });
});

test('users can choose which suggested relationships to add', async ({ page }) => {
 test.setTimeout(60000);
 const workspace = {
   version: 2,
   cards: [
     { id: 'a', data: { kind: 'file', path: 'repo/main.ts', label: 'main.ts', sourceText: "import './one';\nimport './two';" } },
     { id: 'b', data: { kind: 'file', path: 'repo/one.ts', label: 'one.ts' } },
     { id: 'c', data: { kind: 'file', path: 'repo/two.ts', label: 'two.ts' } },
   ],
   boards: [{ id: 'board', title: 'Files', extra: {}, nodes: [
     { id: 'a-node', cardId: 'a', position: { x: 50, y: 50 } },
     { id: 'b-node', cardId: 'b', position: { x: 400, y: 50 } },
     { id: 'c-node', cardId: 'c', position: { x: 400, y: 250 } },
   ], edges: [] }],
 };
 await page.addInitScript(value => localStorage.setItem('solocanvas.workspace.v2', JSON.stringify(value)), workspace);
 await page.goto('/'); await page.getByRole('button', { name: 'Open workspace' }).click();
 const panel = page.getByRole('region', { name: 'Import relationship suggestions' });
 await panel.getByRole('button', { name: 'Analyze board imports' }).click();
 await expect(panel).toContainText('2 relationship(s) suggested', { timeout: 20000 });
 const first = panel.getByRole('checkbox', { name: /imports .\/one/ });
 const second = panel.getByRole('checkbox', { name: /imports .\/two/ });
 await expect(first).toBeChecked(); await expect(second).toBeChecked();
 await first.uncheck(); await second.uncheck();
 await expect(panel.getByRole('button', { name: 'Add suggested relationships' })).toBeDisabled();
 await first.check();
 await panel.getByRole('button', { name: 'Add suggested relationships' }).click();
 await expect(page.locator('.react-flow__edge')).toHaveCount(1);
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('Workspace saved');
 const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solocanvas.workspace.v2')));
 expect(saved.boards[0].edges[0].target).toBe('b-node');
 await panel.getByRole('button', { name: 'Analyze board imports' }).click();
 await expect(panel).toContainText('1 relationship(s) suggested', { timeout: 20000 });
 await expect(panel.getByRole('checkbox', { name: /imports .\/two/ })).toBeChecked();
});

test('an analysis can be cancelled without changing the workspace', async ({ page }) => {
 await page.addInitScript(() => {
   window.Worker = class {
     postMessage() {}
     terminate() { window.testWorkerTerminated = true; }
   };
 });
 await page.goto('/'); await page.getByRole('button', { name: 'Open workspace' }).click();
 const panel = page.getByRole('region', { name: 'Import relationship suggestions' });
 await panel.getByRole('button', { name: 'Analyze board imports' }).click();
 await expect(panel.getByRole('button', { name: 'Cancel import analysis' })).toBeVisible();
 await panel.getByRole('button', { name: 'Cancel import analysis' }).click();
 await expect(panel.getByRole('alert')).toContainText('cancelled');
 expect(await page.evaluate(() => window.testWorkerTerminated)).toBe(true);
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
 await expect(panel.getByRole('button', { name: 'Analyze board imports' })).toBeEnabled();
});

test('edits during worker analysis invalidate the result', async ({ page }) => {
 await page.addInitScript(() => {
   window.Worker = class {
     postMessage() { window.finishTestAnalysis = () => this.onmessage({ data: { ok: true, result: { suggestions: [], diagnostics: [] } } }); }
     terminate() {}
   };
 });
 await page.goto('/'); await page.getByRole('button', { name: 'Open workspace' }).click();
 await page.getByRole('button', { name: 'Add component' }).click();
 await page.locator('.react-flow__node').first().click();
 await page.getByLabel('Shared component name').fill('Before');
 const panel = page.getByRole('region', { name: 'Import relationship suggestions' });
 await panel.getByRole('button', { name: 'Analyze board imports' }).click();
 await page.getByLabel('Shared component name').fill('Kept edit');
 await page.evaluate(() => window.finishTestAnalysis());
 await expect(panel.getByRole('alert')).toContainText('workspace or board changed');
 await expect(page.getByLabel('Shared component name')).toHaveValue('Kept edit');
 await expect(panel.getByRole('button', { name: 'Add suggested relationships' })).toHaveCount(0);
});
