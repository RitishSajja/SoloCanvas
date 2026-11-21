import { test, expect } from './returning-user-fixture.mjs';

test('workspace is the home page and advanced tools stay collapsed until opened', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Pick up where your ideas live.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top-level boards' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open workspace' })).toHaveCount(0);
  await expect(page.locator('details.workspace-header-tools[open]')).toHaveCount(0);

  await page.getByText('Import / export', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export workspace' })).toBeVisible();
  await page.getByRole('button', { name: /^Open board / }).first().click();
  await expect(page.locator('details.workspace-tool[open]')).toHaveCount(0);
  await page.getByText('File map', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Create file map' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Import relationship suggestions' })).toHaveCount(0);
});

test('workspace overview and board fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Top-level boards' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole('button', { name: /^Open board / }).first().click();
  await expect(page.getByRole('region', { name: 'Workspace canvas' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
