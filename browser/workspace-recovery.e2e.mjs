import { test, expect } from '@playwright/test';

test('exports damaged raw data and restores only after confirmation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('solocanvas.workspace.v2', '{damaged');
    localStorage.setItem('solocanvas.workspace.backup.v2', JSON.stringify({ version: 2, cards: [], boards: [{ id: 'b', title: 'Backup', extra: {}, nodes: [], edges: [] }] }));
    localStorage.setItem('solocanvas.board.v1', '{"nodes":[],"edges":[]}');
  });
  await page.goto('/');
  await page.getByText('Workspace recovery', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download workspace data' }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe('{damaged');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Restore workspace backup' }).click();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBe('{damaged');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Restore workspace backup' }).click();
  await expect(page.getByText(/Backup restored/)).toBeVisible();
  const data = await page.evaluate(() => ({
    current: JSON.parse(localStorage.getItem('solocanvas.workspace.v2')),
    damaged: localStorage.getItem('solocanvas.workspace.damaged.v2'),
    legacy: localStorage.getItem('solocanvas.board.v1'),
  }));
  expect(data.current.boards[0].title).toBe('Backup');
  expect(data.damaged).toBe('{damaged');
  expect(data.legacy).toBe('{"nodes":[],"edges":[]}');
  await expect(page.getByRole('button', { name: 'Download preserved damaged data' })).toBeVisible();
});

test('unsupported workspace versions are exportable but never offered restore', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('solocanvas.workspace.v2', '{"version":99}');
    localStorage.setItem('solocanvas.workspace.backup.v2', JSON.stringify({ version: 2, cards: [], boards: [] }));
  });
  await page.goto('/');
  await page.getByText('Workspace recovery', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download workspace data' })).toBeVisible();
  await expect(page.getByText(/unsupported version/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore workspace backup' })).toHaveCount(0);
});
