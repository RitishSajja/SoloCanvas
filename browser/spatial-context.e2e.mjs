import { readFile } from 'node:fs/promises';
import { test, expect } from './returning-user-fixture.mjs';

const key = 'solocanvas.workspace.v2';
const attachment = { id: 'doc', name: 'design.bin', size: 6, base64: 'AP8TDXIh' };
const source = 'const privateSourceMarker = 42;';
const note = 'Private review – à vérifier.';
const position = (id, cardId, x, y) => ({ id, cardId, position: { x, y } });
const evidence = { sourcePath: 'src/api.ts', targetPath: 'src/store.ts', specifier: './store', line: 4, importKind: 'static' };
const original = JSON.stringify({
  version: 2,
  cards: [
    { id: 'overview', data: { label: 'Services' } },
    { id: 'gateway', data: { label: 'Gateway Δ', kind: 'file', path: 'src/api.ts', sourceText: source }, attachments: [attachment] },
    { id: 'store', data: { label: 'Store', kind: 'file', path: 'src/store.ts' } },
    { id: 'queue', data: { label: 'Queue' } },
    { id: 'outside', data: { label: 'Off-board content marker' } },
  ],
  boards: [
    { id: 'project', title: 'Project', extra: {}, nodes: [
      position('services', 'overview', 0, 0), position('other', 'outside', 400, 0),
    ], edges: [] },
    { id: 'services', title: 'Service map', parentPlacement: { boardId: 'project', nodeId: 'services' },
      extra: { privateData: 'private-extra-marker' }, attachments: [attachment],
      nodes: [
        position('duplicate', 'gateway', 540, 60), position('store-node', 'store', 150, -200),
        position('api', 'gateway', -300, -20), position('queue-node', 'queue', -200, 320),
      ],
      edges: [
        { id: 'from-queue', source: 'queue-node', target: 'api', label: 'dispatches' },
        { id: 'to-store', source: 'api', target: 'store-node', label: 'imports', data: { ...evidence, extra: 'private-evidence-marker' } },
      ],
    },
  ],
});

async function openServices(page) {
  await page.addInitScript(([storageKey, saved]) => {
    if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, saved);
  }, [key, original]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open board Project' }).click();
  await page.getByRole('article', { name: 'Component Services', exact: true }).press('Control+Enter');
  await expect(page.getByLabel('Current board')).toHaveValue('services');
}

async function openContext(page) {
  await page.getByRole('button', { name: 'Board tools', exact: true }).click();
  await page.getByText('Board context', { exact: true }).click();
  return page.getByRole('textbox', { name: 'Board context JSON' });
}

async function expectDownloadedPreview(page, preview) {
  const displayed = await preview.inputValue();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download context JSON' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  expect(await readFile(await file.path())).toEqual(Buffer.from(displayed, 'utf8'));
}

test('preview and download one nested board from a legacy workspace before explicit save', async ({ page }) => {
  await openServices(page);
  await page.getByRole('button', { name: 'Add sticky note' }).click();
  await page.getByRole('textbox', { name: 'Sticky note text' }).fill(note);
  const preview = await openContext(page);
  await expect(preview).toHaveJSProperty('readOnly', true);
  const includeText = page.getByRole('checkbox', { name: 'Include sticky note text' });
  await expect(includeText).not.toBeChecked();
  const raw = await preview.inputValue();
  const data = JSON.parse(raw);
  expect(data.scope).toEqual({ kind: 'board' });
  expect(data.board).toMatchObject({ id: 'services', title: 'Service map' });
  expect(data.placements.filter(item => item.componentId === 'gateway').map(item => item.id)).toEqual(['api', 'duplicate']);
  expect(data.placements.find(item => item.id === 'api').position).toEqual({ x: -300, y: -20 });
  expect(data.components.filter(item => item.id === 'gateway')).toHaveLength(1);
  expect(data.relationships).toMatchObject([
    { id: 'from-queue', sourcePlacementId: 'queue-node', targetPlacementId: 'api', kind: 'manual', label: 'dispatches' },
    { id: 'to-store', sourcePlacementId: 'api', targetPlacementId: 'store-node', kind: 'inferred', evidence },
  ]);
  expect(data.notes).toHaveLength(1);
  for (const omitted of [source, attachment.base64, note, 'Off-board content marker', 'private-extra-marker', 'private-evidence-marker']) {
    expect(raw).not.toContain(omitted);
  }
  await expectDownloadedPreview(page, preview);
  await includeText.check();
  await expect(preview).toHaveValue(new RegExp(note));
  await expectDownloadedPreview(page, preview);
  await includeText.uncheck();
  await expect(preview).toHaveValue(raw);

  const api = page.locator('.react-flow__node[data-id="component:api"]');
  await api.press('Enter');
  const editor = api.getByRole('textbox', { name: 'Shared component name' });
  await editor.fill('Billing gateway');
  await editor.press('Enter');
  await expect(preview).toHaveValue(/Billing gateway/);
  await includeText.check();
  await page.getByLabel('Current board').selectOption('project');
  await expect(includeText).not.toBeChecked();
  await expect(preview).toHaveValue(/Off-board content marker/);
  await expect(preview).not.toHaveValue(/Billing gateway/);
  const saved = () => page.evaluate(storageKey => localStorage.getItem(storageKey), key);
  expect(await saved()).toBe(original);
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.backup.v2'))).toBeNull();
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  const workspace = JSON.parse(await saved());
  expect(workspace.cards.find(card => card.id === 'gateway').data.label).toBe('Billing gateway');
  expect(workspace.boards.find(board => board.id === 'services').notes[0].text).toBe(note);
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.backup.v2'))).toBe(original);
});

test('limit the preview and download to the selected placement and its connected neighbors', async ({ page }) => {
  await openServices(page);
  await page.getByRole('button', { name: 'Add sticky note' }).click();
  await page.getByRole('textbox', { name: 'Sticky note text' }).fill(note);
  const preview = await openContext(page);
  const connected = page.getByRole('checkbox', { name: 'Only connected placements' });
  await expect(connected).not.toBeChecked();
  await expect(connected).toBeDisabled();
  const api = page.locator('.react-flow__node[data-id="component:api"]');
  await api.press('Enter');
  await api.getByRole('textbox', { name: 'Shared component name' }).press('Escape');
  await connected.check();
  const subgraph = JSON.parse(await preview.inputValue());
  expect(subgraph.scope).toEqual({ kind: 'connected-placements', placementId: 'api' });
  expect(subgraph.placements.map(item => item.id)).toEqual(['api', 'queue-node', 'store-node']);
  expect(subgraph.relationships.map(item => item.id)).toEqual(['from-queue', 'to-store']);
  expect(subgraph.notes).toEqual([]);
  expect(await preview.inputValue()).not.toContain('duplicate');
  await expectDownloadedPreview(page, preview);
  await page.getByRole('textbox', { name: 'Sticky note text' }).focus();
  await expect(page.getByRole('button', { name: 'Download context JSON' })).toBeDisabled();
  await expect(preview).toHaveCount(0);
  await connected.uncheck();
  expect(JSON.parse(await preview.inputValue()).placements).toHaveLength(4);
  expect(await page.evaluate(storageKey => localStorage.getItem(storageKey), key)).toBe(original);
});
