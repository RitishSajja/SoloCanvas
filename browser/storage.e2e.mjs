import { test, expect } from '@playwright/test';

test('a stale tab cannot overwrite a more recent board and can export its edits', async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto('/');
  await second.goto('/');
  await first.getByRole('button', { name: 'Add component' }).click();
  await first.getByLabel('Component name').fill('First tab');
  await first.getByRole('button', { name: 'Save board' }).click();
  await expect(first.getByRole('status')).toContainText('Saved on this device');
  await second.getByRole('button', { name: 'Add component' }).click();
  await second.getByLabel('Component name').fill('Unsaved second tab');
  await second.getByRole('button', { name: 'Save board' }).click();
  await expect(second.getByRole('status')).toContainText('changed in another tab');
  const saved = await second.evaluate(() => JSON.parse(localStorage.getItem('solocanvas.board.v1')));
  expect(saved.nodes[0].data.label).toBe('First tab');
  const downloadPromise = second.waitForEvent('download');
  await second.getByRole('button', { name: 'Export board' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('solocanvas-board.json');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.nodes[0].data.label).toBe('Unsaved second tab');
});

test('corrupted storage is not overwritten and a backup requires explicit restore', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('solocanvas.board.v1', '{broken');
    localStorage.setItem('solocanvas.board.backup.v1', JSON.stringify({ nodes: [{ id: 'backup', position: { x: 20, y: 20 }, data: { label: 'Recovered' } }], edges: [] }));
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Save board' })).toBeDisabled();
  await expect(page.getByText('Recovered')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.board.v1'))).toBe('{broken');
  await page.getByRole('button', { name: 'Restore previous backup' }).click();
  await expect(page.getByRole('button', { name: 'Save board' })).toBeEnabled();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('solocanvas.board.v1')));
  expect(restored.nodes[0].data.label).toBe('Recovered');
});

test('invalid import does not replace the displayed or saved board', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add component' }).click();
  await page.getByLabel('Component name').fill('Original');
  await page.getByRole('button', { name: 'Save board' }).click();
  const before = await page.evaluate(() => localStorage.getItem('solocanvas.board.v1'));
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"nodes":[null],"edges":[]}') });
  await expect(page.getByRole('status')).toContainText('not a valid SoloCanvas board');
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Original' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.board.v1'))).toBe(before);
});
