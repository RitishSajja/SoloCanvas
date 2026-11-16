import { test, expect } from '@playwright/test';

test('workspace preview creates boards and shares card names without deleting the legacy board', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: 'Add component' }).click();
 await page.getByLabel('Component name').fill('API');
 await page.getByRole('button', { name: 'Save board' }).click();
 await expect(page.getByRole('status')).toContainText('Saved on this device');
 const legacy = await page.evaluate(() => localStorage.getItem('solocanvas.board.v1'));
 await page.getByRole('button', { name: 'Open workspace' }).click();
 await expect(page.getByText('Workspace preview', { exact: true })).toBeVisible();
 await expect(page.locator('.react-flow__node').filter({ hasText: 'API' })).toBeVisible();
 page.once('dialog', dialog => dialog.accept('Second board'));
 await page.getByRole('button', { name: 'New board' }).click();
 await page.getByLabel('Existing component').selectOption({ label: 'API' });
 await page.getByRole('button', { name: 'Place component' }).click();
 await page.locator('.react-flow__node').filter({ hasText: 'API' }).click();
 await page.getByLabel('Shared component name').fill('Gateway');
 await page.getByLabel('Current board').selectOption({ label: 'My board' });
 await expect(page.locator('.react-flow__node').filter({ hasText: 'Gateway' })).toBeVisible();
 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('Workspace saved');
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.board.v1'))).toBe(legacy);
 await page.reload();
 await page.getByRole('button', { name: 'Open workspace' }).click();
 await page.getByLabel('Current board').selectOption({ label: 'Second board' });
 await expect(page.locator('.react-flow__node').filter({ hasText: 'Gateway' })).toBeVisible();
});

test('migration can be cancelled and refuses a stale legacy snapshot', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: 'Open workspace' }).click();
 await page.getByRole('button', { name: 'Add component' }).click();
 page.once('dialog', dialog => dialog.dismiss());
 await page.getByRole('button', { name: 'Save workspace' }).click();
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
 await page.evaluate(() => localStorage.setItem('solocanvas.board.v1', '{"nodes":[],"edges":[]}'));
 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('Stored data changed');
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
});

test('workspace save fails closed without browser locks', async ({ page }) => {
 await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }));
 await page.goto('/');
 await page.getByRole('button', { name: 'Open workspace' }).click();
 await page.getByRole('button', { name: 'Add component' }).click();
 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('requires browser lock support');
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
});

test('leaving the workspace preserves the original editor unsaved work', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: 'Add component' }).click();
 await page.getByLabel('Component name').fill('Unsaved draft');
 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'Open workspace' }).click();
 await page.getByRole('button', { name: 'Back to board' }).click();
 await expect(page.locator('.react-flow__node').filter({ hasText: 'Unsaved draft' })).toBeVisible();
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.board.v1'))).toBeNull();
});
