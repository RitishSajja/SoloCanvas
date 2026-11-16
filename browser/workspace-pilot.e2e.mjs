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
