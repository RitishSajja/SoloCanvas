import { test, expect } from '@playwright/test';
const v2 = title => ({ version: 2, cards: [{ id: 'c', data: { label: title } }], boards: [{ id: 'b', title: 'Imported board', extra: {}, nodes: [{ id: 'n', cardId: 'c', position: { x: 0, y: 0 } }], edges: [] }] });
const file = data => ({ name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });

test('imports an exported workspace only after confirmation and saves explicitly', async ({ page }) => {
 await page.goto('/'); await page.getByRole('button', { name: 'Open workspace' }).click();
 await page.getByRole('button', { name: 'Add component' }).click();
 page.once('dialog', dialog => dialog.dismiss());
 await page.getByLabel('Import workspace').setInputFiles(file(v2('Imported')));
 await expect(page.locator('.react-flow__node').filter({ hasText: 'New component' })).toBeVisible();
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
 page.once('dialog', dialog => dialog.accept());
 await page.getByLabel('Import workspace').setInputFiles(file(v2('Imported')));
 await expect(page.locator('.react-flow__node').filter({ hasText: 'Imported' })).toBeVisible();
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('Workspace saved');
 await page.reload(); await page.getByRole('button', { name: 'Open workspace' }).click();
 await expect(page.locator('.react-flow__node').filter({ hasText: 'Imported' })).toBeVisible();
});

test('invalid workspace and stale snapshots never overwrite stored data', async ({ page }) => {
 await page.goto('/'); await page.getByRole('button', { name: 'Open workspace' }).click();
 await page.getByRole('button', { name: 'Add component' }).click();
 const bad = v2('Bad'); bad.boards[0].nodes[0].cardId = 'missing';
 await page.getByLabel('Import workspace').setInputFiles(file(bad));
 await expect(page.getByRole('status')).toContainText('not a valid SoloCanvas workspace');
 await expect(page.locator('.react-flow__node').filter({ hasText: 'New component' })).toBeVisible();
 page.once('dialog', dialog => dialog.accept());
 await page.getByLabel('Import workspace').setInputFiles(file(v2('Imported')));
 await page.evaluate(() => localStorage.setItem('solocanvas.board.v1', '{"nodes":[],"edges":[]}'));
 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('Stored data changed');
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
});
