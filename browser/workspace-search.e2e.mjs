import { test, expect } from '@playwright/test';

test('search locates and opens shared components across boards', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByRole('button', { name: 'Add component' }).click();
  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('Shared component name').fill('API Gateway');
  page.once('dialog', dialog => dialog.accept('Services'));
  await page.getByRole('button', { name: 'New board' }).click();
  await page.getByLabel('Existing component').selectOption({ label: 'API Gateway' });
  await page.getByRole('button', { name: 'Place component' }).click();
  await page.getByLabel('Find components across boards').fill('gateway');
  const results = page.getByRole('region', { name: 'Component search results' });
  await expect(results.getByText('API Gateway')).toBeVisible();
  await expect(results.getByRole('button', { name: 'Open on My board' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'Open on Services' })).toBeVisible();
  await results.getByRole('button', { name: 'Open on My board' }).click();
  await expect(page.getByLabel('Current board')).toHaveValue(
    await page.getByRole('option', { name: 'My board' }).getAttribute('value') ?? ''
  );
  await expect(page.getByLabel('Shared component name')).toHaveValue('API Gateway');
  await page.getByLabel('Shared component name').fill('API Service');
  await expect(results.getByText('No matching components.')).toBeVisible();
  await page.getByLabel('Find components across boards').fill('service');
  await results.getByRole('button', { name: 'Open on Services' }).click();
  await expect(page.getByLabel('Shared component name')).toHaveValue('API Service');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  await page.reload();
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByLabel('Find components across boards').fill('api');
  await expect(page.getByRole('button', { name: 'Open on My board' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open on Services' })).toBeVisible();
});
