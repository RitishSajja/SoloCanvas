import { test, expect } from '@playwright/test';

const existingWorkspace = {
 version: 2,
 cards: [{ id: 'existing-card', data: { label: 'Existing component' } }],
 boards: [{ id: 'existing-board', title: 'Existing board', extra: {}, nodes: [
  { id: 'existing-node', cardId: 'existing-card', position: { x: 0, y: 0 } },
 ], edges: [] }],
};
const diagram = [
 'flowchart LR',
 '  n0["Gateway #124; API"]',
 '  n1["Database #128512;"]',
 '  n0 -->|reads #124; writes| n1',
].join('\n') + '\n';

async function openWorkspace(page) {
 await page.addInitScript(value => {
  if (localStorage.getItem('solocanvas.workspace.v2') === null) {
   localStorage.setItem('solocanvas.workspace.v2', JSON.stringify(value));
  }
 }, existingWorkspace);
 await page.goto('/');
 await page.getByRole('article', { name: 'Board Existing board', exact: true }).press('Control+Enter');
 await page.getByText('Mermaid import', { exact: true }).click();
}

test('previews Mermaid as inert text, preserves unsaved edits on cancel, and saves the new board explicitly', async ({ page }) => {
 await openWorkspace(page);
 const savedBefore = await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'));
 await page.getByRole('button', { name: 'Add component' }).click();
 await page.getByLabel('Mermaid flowchart').fill(diagram);
 await page.getByRole('button', { name: 'Preview Mermaid import' }).click();
 await expect(page.getByText('2 component(s) and 1 relationship(s) will be imported.')).toBeVisible();
 await page.getByText('Review components').click();
 await expect(page.getByText('Gateway | API', { exact: true })).toBeVisible();

 page.once('dialog', dialog => dialog.dismiss());
 await page.getByRole('button', { name: 'Create new board from preview' }).click();
 await expect(page.getByLabel('Current board')).toHaveValue('existing-board');
 await expect(page.locator('.react-flow__node')).toHaveCount(2);
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBe(savedBefore);

 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'Create new board from preview' }).click();
 const importedBoardId = await page.getByLabel('Current board').inputValue();
 expect(importedBoardId).not.toBe('existing-board');
 await expect(page.locator('.react-flow__node').filter({ hasText: 'Gateway | API' })).toBeVisible();
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBe(savedBefore);
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('Workspace saved');

 await page.reload();
 await page.getByRole('article', { name: 'Board Imported Mermaid diagram', exact: true }).press('Control+Enter');
 await page.getByText('Mermaid import', { exact: true }).click();
 await page.getByLabel('Current board').selectOption({ label: 'Imported Mermaid diagram' });
 await expect(page.locator('.react-flow__node').filter({ hasText: 'Database 😀' })).toBeVisible();
 await expect(page.locator('.react-flow__edge').filter({ hasText: 'reads | writes' })).toBeVisible();
});

test('accepts a user-selected text file and invalidates a preview after workspace edits', async ({ page }) => {
 await openWorkspace(page);
 await page.getByLabel('Choose Mermaid file').setInputFiles({
  name: 'map.mmd', mimeType: 'text/plain', buffer: Buffer.from(diagram),
 });
 await expect(page.getByText('Loaded map.mmd. Edit the text below or preview it.')).toBeVisible();
 await page.getByRole('button', { name: 'Preview Mermaid import' }).click();
 await page.getByRole('button', { name: 'Add component' }).click();
 await expect(page.getByRole('alert')).toContainText('Workspace changed after preview');
 await expect(page.getByRole('button', { name: 'Create new board from preview' })).toHaveCount(0);
 await expect(page.locator('.react-flow__node')).toHaveCount(2);
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBe(JSON.stringify(existingWorkspace));
});

test('rejects Mermaid directives and oversized local files without changing the workspace', async ({ page }) => {
 await openWorkspace(page);
 await page.getByLabel('Mermaid flowchart').fill('flowchart LR\n  %%{init: {"theme":"dark"}}%%');
 await page.getByRole('button', { name: 'Preview Mermaid import' }).click();
 await expect(page.getByRole('alert')).toContainText('Line 2:');
 await page.getByLabel('Choose Mermaid file').setInputFiles({
  name: 'large.mmd', mimeType: 'text/plain', buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
 });
 await expect(page.getByRole('alert')).toContainText('exceeds 5 MiB');
 await expect(page.locator('.react-flow__node')).toHaveCount(1);
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBe(JSON.stringify(existingWorkspace));
});

test('keeps escaped HTML-like component labels as inert text', async ({ page }) => {
 await openWorkspace(page);
 await page.getByLabel('Mermaid flowchart').fill([
  'flowchart LR',
  '  n0["#60;img#32;src#61;bad#32;onerror#61;alert#40;1#41;#62;"]',
 ].join('\n'));
 await page.getByRole('button', { name: 'Preview Mermaid import' }).click();
 await page.getByText('Review components').click();
 await expect(page.getByText('<img src=bad onerror=alert(1)>', { exact: true })).toBeVisible();
 expect(await page.locator('img[src="bad"]').count()).toBe(0);
});

test('quota failure after Mermaid import keeps saved bytes unchanged and imported edits exportable', async ({ page }) => {
 await openWorkspace(page);
 const savedBefore = await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'));
 await page.getByLabel('Mermaid flowchart').fill(diagram);
 await page.getByRole('button', { name: 'Preview Mermaid import' }).click();
 page.once('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'Create new board from preview' }).click();

 await page.evaluate(() => {
  window.restoreWorkspaceStorage = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
   if (key === 'solocanvas.workspace.v2') throw new DOMException('Quota exceeded', 'QuotaExceededError');
   return window.restoreWorkspaceStorage.call(this, key, value);
  };
 });
 await page.getByRole('button', { name: 'Save workspace' }).click();
 await expect(page.getByRole('status')).toContainText('could not be saved');
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBe(savedBefore);
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.backup.v2'))).toBe(savedBefore);

 const pending = page.waitForEvent('download');
 await page.getByText('Import / export', { exact: true }).click();
 await page.getByRole('button', { name: 'Export workspace' }).click();
 const download = await pending;
 const stream = await download.createReadStream(); const chunks = [];
 for await (const chunk of stream) chunks.push(chunk);
 const exported = JSON.parse(Buffer.concat(chunks).toString());
 expect(exported.boards.map(board => board.title)).toContain('Imported Mermaid diagram');
 expect(exported.cards.map(card => card.data.label)).toContain('Gateway | API');
});
