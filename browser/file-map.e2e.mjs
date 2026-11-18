import { test, expect } from '@playwright/test';

test('selected files create a local map only after review and explicit save', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByRole('button', { name: 'Add component' }).click();
  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('Shared component name').fill('Existing');
  const chooser = page.getByLabel('Choose files for map');
  await chooser.setInputFiles([
    { name: 'server.ts', mimeType: 'text/plain', buffer: Buffer.from('SECRET_FILE_CONTENT_A') },
    { name: 'client.js', mimeType: 'text/plain', buffer: Buffer.from('SECRET_FILE_CONTENT_B') },
  ]);
  const panel = page.getByRole('region', { name: 'Create file map' });
  await expect(panel).toContainText('2 file(s) selected');
  await expect(panel.getByText('server.ts', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
  page.once('dialog', dialog => dialog.dismiss());
  await panel.getByRole('button', { name: 'Create file map board' }).click();
  await expect(page.getByLabel('Current board')).toHaveValue('board-1');
  await expect(panel.getByRole('button', { name: 'Create file map board' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept('Code files'));
  await panel.getByRole('button', { name: 'Create file map board' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.locator('.react-flow__node').filter({ hasText: 'server.ts' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  const stored = await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'));
  expect(stored).not.toContain('SECRET_FILE_CONTENT');
  const workspace = JSON.parse(stored);
  expect(workspace.boards).toHaveLength(2);
  expect(workspace.boards[1].edges).toHaveLength(0);
  expect(workspace.cards.map(card => card.data.path).filter(Boolean).sort()).toEqual(['client.js', 'server.ts']);
  await page.reload();
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByLabel('Current board').selectOption({ label: 'Code files' });
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByLabel('Current board').selectOption({ label: 'My board' });
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Existing' })).toBeVisible();
});

test('duplicate selected names do not create a map', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByLabel('Choose files for map').setInputFiles([
    { name: 'same.js', mimeType: 'text/plain', buffer: Buffer.from('a') },
    { name: 'same.js', mimeType: 'text/plain', buffer: Buffer.from('b') },
  ]);
  await expect(page.getByRole('alert')).toContainText('paths must be unique');
  await expect(page.getByRole('button', { name: 'Create file map board' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
});
