import { test, expect } from './returning-user-fixture.mjs';
import { openWorkspaceBoard, renameSelectedComponent } from './workspace-helpers.mjs';

test('search locates and opens shared components across boards', async ({ page }) => {
  await page.goto('/');
  await openWorkspaceBoard(page);
  await page.getByRole('button', { name: 'Add component' }).click();
  await page.locator('.react-flow__node').first().click();
  await renameSelectedComponent(page, 'API Gateway');
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
  await expect(page.locator('.workspace-component-node.selected')).toContainText('API Gateway');
  await renameSelectedComponent(page, 'API Service');
  await expect(results.getByText('No matching components.')).toBeVisible();
  await page.getByLabel('Find components across boards').fill('service');
  await results.getByRole('button', { name: 'Open on Services' }).click();
  await expect(page.locator('.workspace-component-node.selected')).toContainText('API Service');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  await page.reload();
  await openWorkspaceBoard(page);
  await page.getByLabel('Find components across boards').fill('api');
  await expect(page.getByRole('button', { name: 'Open on My board' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open on Services' })).toBeVisible();
});

test('component appearances navigate to a distant placement on another board', async ({ page }) => {
  const workspace = {
    version: 2,
    cards: [{ id: 'api', data: { label: 'Shared API' } }],
    boards: [
      { id: 'first', title: 'First board', extra: {}, nodes: [{ id: 'first-api', cardId: 'api', position: { x: 0, y: 0 } }], edges: [] },
      { id: 'second', title: 'Second board', extra: {}, nodes: [{ id: 'far-api', cardId: 'api', position: { x: 4000, y: 3000 } }], edges: [] },
    ],
  };
  await page.addInitScript(value => localStorage.setItem('solocanvas.workspace.v2', JSON.stringify(value)), workspace);
  await page.goto('/');
  await openWorkspaceBoard(page);
  await page.locator('.react-flow__node').filter({ hasText: 'Shared API' }).click();
  const appearances = page.getByRole('region', { name: 'Component appearances' });
  await expect(appearances.getByRole('button', { name: 'Open on First board' })).toBeVisible();
  await appearances.getByRole('button', { name: 'Open on Second board' }).click();
  await expect(page.getByLabel('Current board')).toHaveValue('second');
  await expect(page.locator('.workspace-component-node.selected')).toContainText('Shared API');
  const node = page.locator('.react-flow__node').filter({ hasText: 'Shared API' });
  await expect(node).toBeVisible();
  await expect.poll(async () => {
    const nodeBox = await node.boundingBox();
    const canvasBox = await page.getByRole('region', { name: 'Workspace canvas' }).boundingBox();
    if (!nodeBox || !canvasBox) return Infinity;
    return Math.abs(nodeBox.x + nodeBox.width / 2 - (canvasBox.x + canvasBox.width / 2)) +
      Math.abs(nodeBox.y + nodeBox.height / 2 - (canvasBox.y + canvasBox.height / 2));
  }).toBeLessThan(40);
  await expect(appearances).toContainText('(current)');
  await appearances.getByRole('button', { name: 'Open on First board' }).click();
  await expect(page.getByLabel('Current board')).toHaveValue('first');
});

test('keyboard selection and distinct appearances work for repeated placements', async ({ page }) => {
  const workspace = {
    version: 2,
    cards: [{ id: 'api', data: { label: 'Shared API' } }],
    boards: [{ id: 'b', title: 'Architecture', extra: {}, nodes: [
      { id: 'one', cardId: 'api', position: { x: 0, y: 0 } },
      { id: 'two', cardId: 'api', position: { x: 600, y: 0 } },
    ], edges: [] }],
  };
  await page.addInitScript(value => localStorage.setItem('solocanvas.workspace.v2', JSON.stringify(value)), workspace);
  await page.goto('/');
  await openWorkspaceBoard(page);
  const first = page.locator('.react-flow__node').filter({ hasText: 'Shared API' }).first();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Shared component name' })).toHaveValue('Shared API');
  await page.keyboard.press('Escape');
  const appearances = page.getByRole('region', { name: 'Component appearances' });
  const firstAppearance = appearances.getByRole('button', { name: 'Open on Architecture — placement 1' });
  const secondAppearance = appearances.getByRole('button', { name: 'Open on Architecture — placement 2' });
  await expect(firstAppearance).toHaveAttribute('aria-current', 'location');
  await secondAppearance.focus();
  await page.keyboard.press('Enter');
  await expect(secondAppearance).toHaveAttribute('aria-current', 'location');
  await expect(firstAppearance).not.toHaveAttribute('aria-current', 'location');
  await page.getByLabel('Find components across boards').fill('api');
  const results = page.getByRole('region', { name: 'Component search results' });
  await expect(results.getByRole('button', { name: 'Open on Architecture — placement 1' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'Open on Architecture — placement 2' })).toBeVisible();
});
