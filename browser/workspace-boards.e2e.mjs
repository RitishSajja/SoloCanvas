import { test, expect } from './returning-user-fixture.mjs';

test('renaming and deleting boards preserves shared cards and requires an explicit save', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('button', { name: 'Delete board' })).toBeDisabled();
  await page.getByRole('button', { name: 'Add component' }).click();
  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('Shared component name').fill('Shared API');
  page.once('dialog', dialog => dialog.accept('Second board'));
  await page.getByRole('button', { name: 'New board' }).click();
  await page.getByLabel('Existing component').selectOption({ label: 'Shared API' });
  await page.getByRole('button', { name: 'Place component' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  const stored = await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'));

  page.once('dialog', dialog => dialog.accept('  Architecture  '));
  await page.getByRole('button', { name: 'Rename board' }).click();
  await expect(page.getByLabel('Current board')).toHaveValue(
    await page.getByRole('option', { name: 'Architecture' }).getAttribute('value') ?? ''
  );
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBe(stored);
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).not.toBe(stored);
  await page.reload();
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByLabel('Current board').selectOption({ label: 'Architecture' });
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Shared API' })).toBeVisible();

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete board' }).click();
  await expect(page.getByRole('option', { name: 'Architecture' })).toHaveCount(1);
  const beforeDelete = await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete board' }).click();
  await expect(page.getByRole('option', { name: 'Architecture' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete board' })).toBeDisabled();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Shared API' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBe(beforeDelete);
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).not.toBe(beforeDelete);
  await page.reload();
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('option', { name: 'Architecture' })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Shared API' })).toHaveCount(1);
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Shared API' })).toBeVisible();
});

test('nested mini-boards reopen from their placements after saving and reloading', async ({ page }) => {
  const button = name => page.getByRole('button', { name, exact: true });
  await page.goto('/');
  await button('Open workspace').click();
  const selector = page.getByLabel('Current board');
  const root = await selector.inputValue();
  const ids = [];
  for (const label of ['Platform', 'Billing']) {
    await button('Add component').click();
    await page.locator('.react-flow__node').last().click();
    await page.getByLabel('Shared component name').fill(label);
    await button('Create mini-board').click();
    await expect(selector.locator('option:checked')).toHaveText(label);
    ids.push(await selector.inputValue());
  }
  await button('Back to Platform').click();
  await expect(selector).toHaveValue(ids[0]);
  await button('Back to My board').click();
  await expect(selector).toHaveValue(root);
  page.once('dialog', dialog => dialog.accept());
  await button('Save workspace').click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  await page.reload();
  await button('Open workspace').click();
  for (const [index, label] of ['Platform', 'Billing'].entries()) {
    await page.locator('.react-flow__node').filter({ hasText: label }).click();
    await button('Open mini-board').click();
    await expect(selector).toHaveValue(ids[index]);
  }
});
