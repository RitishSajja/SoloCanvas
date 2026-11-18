import { test, expect } from '@playwright/test';

test('static import suggestions are reviewed, applied and saved explicitly', async ({ page }) => {
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
 await expect(panel).toContainText('1 relationship(s) suggested');
 await expect(panel).toContainText("repo/main.ts:1 imports ./service → repo/service.ts");
 await expect(panel).toContainText('unresolved local import');
 await expect(page.locator('.react-flow__edge')).toHaveCount(0);
 await page.locator('.react-flow__node').filter({ hasText: 'main.ts' }).click();
 await page.getByLabel('Shared component name').fill('renamed.ts');
 await expect(panel).toContainText('Workspace changed');
 await expect(panel.getByRole('button', { name: 'Add suggested relationships' })).toHaveCount(0);
 await panel.getByRole('button', { name: 'Analyze board imports' }).click();
 await expect(panel).toContainText('1 relationship(s) suggested');
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
 await expect(panel).toContainText('0 relationship(s) suggested');
});
