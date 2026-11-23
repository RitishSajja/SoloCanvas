import { test, expect } from './returning-user-fixture.mjs';

const storageKey = 'solocanvas.workspace.v2';
const seed = {
  version: 2,
  cards: [
    { id: 'api', data: { label: 'API' } },
    { id: 'worker', data: { label: 'Worker' } },
    { id: 'source', data: { label: 'Source', kind: 'file', path: 'src/billing/invoicing/handler.ts' },
      attachments: [{ id: 'contract', name: 'contract.pdf', size: 2, base64: 'AQI=' }] },
  ],
  boards: [
    { id: 'project', title: 'Project', extra: {}, nodes: [
      { id: 'api-node', cardId: 'api', position: { x: 0, y: 0 } },
      { id: 'worker-node', cardId: 'worker', position: { x: 500, y: 0 } },
    ], edges: [] },
    { id: 'backend', title: 'Backend', parentPlacement: { boardId: 'project', nodeId: 'api-node' },
      extra: {}, nodes: [{ id: 'src-node', cardId: 'source', position: { x: 0, y: 0 } }], edges: [] },
  ],
};

test('a new component is ready to name from the canvas', async ({ page }) => {
  await page.addInitScript(({ key, data }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, { key: storageKey, data: seed });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open board Project', exact: true }).click();
  await page.getByRole('button', { name: 'Add component', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Shared component name', exact: true });
  await expect(name).toBeFocused();
  expect(await name.evaluate(input => input.value.slice(input.selectionStart, input.selectionEnd))).toBe('New component');
  await page.keyboard.type('Billing queue');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('article', { name: 'Component Billing queue', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Board tools', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  await page.reload();
  await page.getByRole('button', { name: 'Open board Project', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Component Billing queue', exact: true })).toBeVisible();
  await expect(name).toHaveCount(0);
});

test('a board opens by mouse, renames in place, and its components open with Ctrl+Enter', async ({ page }) => {
  await page.addInitScript(({ key, data }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, { key: storageKey, data: seed });
  await page.goto('/');

  const board = page.getByRole('article', { name: 'Board Project', exact: true });
  const rename = board.getByRole('button', { name: 'Rename board' });
  await rename.click();
  const boardName = page.getByRole('textbox', { name: 'Board name', exact: true });
  await expect(boardName).toBeFocused();
  await boardName.fill('Canceled title');
  await boardName.press('Escape');
  await expect(rename).toBeFocused();
  await rename.click();
  await expect(boardName).toHaveValue('Project');
  await boardName.fill('Services');
  await boardName.press('Enter');
  const services = page.getByRole('article', { name: 'Board Services', exact: true });
  await expect(services).toBeVisible();
  await services.click({ position: { x: 10, y: 30 } });
  const selector = page.getByLabel('Current board');
  await expect(selector).toHaveValue('project');
  await expect(selector.locator('option:checked')).toHaveText('Services');
  await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Workspace overview' }).click();
  await services.getByRole('button', { name: 'Open board Services' }).press('Enter');
  await expect(selector).toHaveValue('project');

  const nodes = page.locator('.workspace-component-node');
  const api = nodes.filter({ hasText: 'Backend' });
  const worker = nodes.filter({ hasText: 'Worker' });
  await expect(api.locator('.component-details')).toContainText('src/billing/invoicing/handler.ts');
  await expect(api.locator('.component-details')).toContainText('contract.pdf');
  await expect(api.locator('.component-details')).toContainText('1 component');
  await expect.poll(async () => {
    const detailed = await api.boundingBox();
    const plain = await worker.boundingBox();
    return detailed && plain ? detailed.height - plain.height : 0;
  }).toBeGreaterThan(0);

  await api.click();
  const name = page.getByRole('textbox', { name: 'Shared component name', exact: true });
  await expect(name).toBeFocused();
  await name.fill('Billing');
  const shape = page.getByLabel('Component shape');
  await shape.focus();
  await shape.selectOption('diamond');
  await expect(api.locator('.shape-diamond strong')).toHaveText('Billing');
  await api.locator('strong').click();
  await name.fill('Public API');
  const componentFiles = api.locator('details.local-files');
  await componentFiles.locator('summary').click();
  await expect(componentFiles.getByLabel('Attach component file')).toBeVisible();
  await expect(api.locator('strong')).toHaveText('Public API');
  await componentFiles.locator('summary').click();
  await api.locator('strong').click();
  await name.fill('Ignore this');
  await name.press('Escape');
  await api.locator('strong').dblclick();
  await expect(name).toHaveValue('Public API');
  await expect(selector).toHaveValue('project');
  await name.fill('Billing API');
  await name.press('Control+Enter');
  await expect(selector).toHaveValue('backend');
  await expect(page.getByRole('heading', { name: 'Backend', exact: true })).toBeVisible();
  await expect(page.locator('.workspace-component-copy > small')).toHaveText('FILE');
  await page.getByRole('navigation', { name: 'Workspace breadcrumbs' }).getByRole('button', { name: 'Services', exact: true }).click();
  await expect(api).toContainText('Billing API');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).cards[0].data.label, storageKey)).toBe('API');
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  await page.reload();
  await page.getByRole('article', { name: 'Board Services', exact: true }).press('Control+Enter');
  await expect(api).toContainText('Billing API');

  const resizable = page.locator('[data-id="component:worker-node"] article');
  const height = () => resizable.evaluate(element => element.offsetHeight);
  const initialHeight = await height();
  await resizable.locator('strong').click();
  await name.fill('Reconciliation worker with multiple responsibilities '.repeat(12));
  await name.press('Enter');
  await expect.poll(height).toBeGreaterThan(initialHeight);
  await resizable.locator('strong').click();
  await name.fill('Worker');
  await name.press('Enter');
  await expect.poll(height).toBe(initialHeight);
});
