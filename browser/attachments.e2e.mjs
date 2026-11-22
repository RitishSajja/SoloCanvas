import { readFile } from 'node:fs/promises';
import { test, expect } from './returning-user-fixture.mjs';

test('a workspace, board, and shared component can each save and download their own copy of a filename', async ({ page }) => {
  const seed = {
    version: 3, cards: [{ id: 'api', data: { label: 'API' } }],
    boards: ['Project', 'Second'].map(title => ({
      id: title, title, parentPlacement: null, extra: {}, notes: [], edges: [],
      nodes: [{ id: 'placement', cardId: 'api', position: { x: 0, y: 0 }, shape: 'pill' }],
    })),
  };
  await page.addInitScript(workspace => {
    if (!localStorage.getItem('solocanvas.workspace.v2')) localStorage.setItem('solocanvas.workspace.v2', JSON.stringify(workspace));
  }, seed);
  await page.goto('/');
  const fileName = 'design.bin';
  const scopes = ['Workspace', 'Board', 'Component'];
  const bytes = {
    Workspace: Buffer.from([0, 255, 128, 97]),
    Board: Buffer.from([254, 0, 32]),
    Component: Buffer.from([10, 13, 254, 9, 0]),
  };
  const filesAt = scope => page.getByRole('group', { name: scope + ' files', exact: true });
  const openBoard = title => page.getByRole('article', { name: 'Board ' + title, exact: true }).press('Control+Enter');
  const download = section => section.getByRole('button', { name: 'Download ' + fileName, exact: true });
  const status = page.getByRole('status');
  async function save() {
    await page.getByRole('button', { name: 'Save workspace' }).click();
    await expect(status).toContainText('Workspace saved');
  }

  for (const scope of scopes) {
    if (scope === 'Board') await openBoard('Project');
    const section = filesAt(scope);
    await section.locator('summary').click();
    const input = section.getByLabel('Attach ' + scope.toLowerCase() + ' file');
    if (scope === 'Workspace') {
      await input.setInputFiles({ name: fileName, mimeType: 'application/octet-stream', buffer: Buffer.alloc(256 * 1024 + 1) });
      await expect(section.getByRole('alert')).toContainText('256 KiB');
      await expect(download(section)).toHaveCount(0);
    }
    await input.setInputFiles({ name: fileName, mimeType: 'application/octet-stream', buffer: bytes[scope] });
    await expect(download(section)).toBeVisible();
    await section.locator('summary').click();
  }
  await save();
  await page.reload();
  await openBoard('Project');

  for (const scope of scopes) {
    const section = filesAt(scope);
    await section.locator('summary').click();
    const downloaded = page.waitForEvent('download');
    await download(section).click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe(fileName);
    expect(await readFile(await file.path())).toEqual(bytes[scope]);
    if (scope === 'Board') {
      await section.getByRole('button', { name: 'Remove ' + fileName }).click();
      await expect(download(section)).toHaveCount(0);
    }
    await section.locator('summary').click();
  }
  await save();
  await page.reload();
  await openBoard('Second');
  await expect(filesAt('Workspace').locator('summary')).toContainText('(1)');
  await expect(filesAt('Board').locator('summary')).toContainText('(0)');
  await expect(filesAt('Component').locator('summary')).toContainText('(1)');
  await page.getByLabel('Current board').selectOption('Project');
  await expect(filesAt('Board').locator('summary')).toContainText('(0)');

  const componentFiles = filesAt('Component');
  await componentFiles.locator('summary').click();
  await page.getByRole('article', { name: 'Component API', exact: true }).getByText('API', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Shared component name' }).fill('Renamed API');
  await componentFiles.getByRole('button', { name: 'Remove ' + fileName, exact: true }).click();
  await expect(page.getByRole('article', { name: 'Component Renamed API', exact: true })).toBeVisible();
  await expect(componentFiles.locator('summary')).toContainText('(0)');
  await save();
  await page.reload();
  await openBoard('Project');
  await expect(page.getByRole('article', { name: 'Component Renamed API', exact: true })).toBeVisible();
  await expect(componentFiles.locator('summary')).toContainText('(0)');
});
