import { test, expect } from './returning-user-fixture.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('selected files create a local map only after review and explicit save', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByRole('button', { name: 'Add component' }).click();
  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('Shared component name').fill('Existing');
  const chooser = page.getByLabel('Choose files for map');
  await chooser.setInputFiles([
    { name: 'server.ts', mimeType: 'text/plain', buffer: Buffer.from('SECRET_FILE_CONTENT_A') },
    { name: 'client.js', mimeType: 'text/plain', buffer: Buffer.from('SECRET_FILE_CONTENT_B') },
  ]);
  const panel = page.getByRole('region', { name: 'Create file map' });
  await expect(panel).toContainText('2 file(s) selected');
  await expect(panel.getByText('server.ts', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
  page.once('dialog', dialog => dialog.dismiss());
  await panel.getByRole('button', { name: 'Create file map board' }).click();
  await expect(page.getByLabel('Current board')).toHaveValue('board-1');
  await expect(panel.getByRole('button', { name: 'Create file map board' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept('Code files'));
  await panel.getByRole('button', { name: 'Create file map board' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.locator('.react-flow__node').filter({ hasText: 'server.ts' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  const stored = await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'));
  expect(stored).not.toContain('SECRET_FILE_CONTENT');
  const workspace = JSON.parse(stored);
  expect(workspace.boards).toHaveLength(2);
  expect(workspace.boards[1].edges).toHaveLength(0);
  expect(workspace.cards.map(card => card.data.path).filter(Boolean).sort()).toEqual(['client.js', 'server.ts']);
  await page.reload();
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByLabel('Current board').selectOption({ label: 'Code files' });
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByLabel('Current board').selectOption({ label: 'My board' });
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Existing' })).toBeVisible();
});

test('duplicate selected names do not create a map', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByLabel('Choose files for map').setInputFiles([
    { name: 'same.js', mimeType: 'text/plain', buffer: Buffer.from('a') },
    { name: 'same.js', mimeType: 'text/plain', buffer: Buffer.from('b') },
  ]);
  await expect(page.getByRole('alert')).toContainText('paths must be unique');
  await expect(page.getByRole('button', { name: 'Create file map board' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
});

test('folder selection preserves relative paths in the generated board', async ({ page }) => {
  const folder = await mkdtemp(join(tmpdir(), 'solocanvas-map-'));
  try {
    await mkdir(join(folder, 'src'));
    await writeFile(join(folder, 'src', 'alpha.ts'), 'private source text');
    await writeFile(join(folder, 'README.md'), 'private documentation');
    await page.goto('/');
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.getByLabel('Choose folder for map').setInputFiles(folder);
    const panel = page.getByRole('region', { name: 'Create file map' });
    await expect(panel).toContainText('2 file(s) selected');
    await expect(panel).toContainText('src/alpha.ts');
    page.once('dialog', dialog => dialog.accept('Folder map'));
    await panel.getByRole('button', { name: 'Create file map board' }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Save workspace' }).click();
    await expect(page.getByRole('status')).toContainText('Workspace saved');
    const saved = await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'));
    expect(saved).not.toContain('private source text');
    const paths = JSON.parse(saved).cards.map(card => card.data.path);
    expect(paths.some(path => path.endsWith('/src/alpha.ts'))).toBe(true);
    expect(paths.some(path => path.endsWith('/README.md'))).toBe(true);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('source text is opt-in, bounded, displayed as text and removable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByLabel('Choose files for map').setInputFiles([
    { name: 'main.ts', mimeType: 'text/plain', buffer: Buffer.from('<script>window.sourceRan = true</script>') },
    { name: 'secret.env', mimeType: 'text/plain', buffer: Buffer.from('SHOULD_NOT_BE_IMPORTED') },
    { name: 'large.py', mimeType: 'text/plain', buffer: Buffer.alloc(65537, 65) },
  ]);
  await page.getByLabel(/Include source text/).check();
  page.once('dialog', dialog => dialog.accept('Source map'));
  await page.getByRole('button', { name: 'Create file map board' }).click();
  const skipped = page.getByRole('region', { name: 'Files without source text' });
  await expect(skipped).toContainText('secret.env: unsupported extension');
  await expect(skipped).toContainText('large.py: file exceeds 64 KiB');
  await page.locator('.react-flow__node').filter({ hasText: 'main.ts' }).click();
  const source = page.getByRole('region', { name: 'Imported source text' });
  await expect(source).toContainText('<script>window.sourceRan = true</script>');
  expect(await page.evaluate(() => window.sourceRan)).toBeUndefined();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  const saved = await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'));
  expect(saved).toContain('window.sourceRan');
  expect(saved).not.toContain('SHOULD_NOT_BE_IMPORTED');
  await page.reload();
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByLabel('Current board').selectOption({ label: 'Source map' });
  await page.locator('.react-flow__node').filter({ hasText: 'main.ts' }).click();
  await expect(source).toContainText('window.sourceRan');
  await source.getByRole('button', { name: 'Remove source text' }).click();
  await expect(source).toHaveCount(0);
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).not.toContain('window.sourceRan');
});

test('edits during source reading are preserved and map creation is cancelled', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByRole('button', { name: 'Add component' }).click();
  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('Shared component name').fill('Before');
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function() {
      const file = this;
      return new Promise(resolve => { window.releaseTestRead = async () => resolve(await original.call(file)); });
    };
  });
  await page.getByLabel('Choose files for map').setInputFiles([
    { name: 'main.js', mimeType: 'text/plain', buffer: Buffer.from('hello') },
  ]);
  await page.getByLabel(/Include source text/).check();
  page.once('dialog', dialog => dialog.accept('Map'));
  await page.getByRole('button', { name: 'Create file map board' }).click();
  await expect.poll(() => page.evaluate(() => typeof window.releaseTestRead)).toBe('function');
  await page.getByLabel('Shared component name').fill('Edit while reading');
  await page.evaluate(() => window.releaseTestRead());
  await expect(page.getByRole('alert')).toContainText('workspace changed');
  await expect(page.getByLabel('Shared component name')).toHaveValue('Edit while reading');
  await expect(page.getByLabel('Current board').locator('option')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
});

test('source content is searchable only after enabling source search', async ({ page }) => {
  const workspace = {
    version: 2,
    cards: [{ id: 'file', data: { label: 'src/main.ts', kind: 'file', path: 'src/main.ts', sourceText: 'function findRareService() {}' } }],
    boards: [{ id: 'b', title: 'Files', extra: {}, nodes: [{ id: 'n', cardId: 'file', position: { x: 0, y: 0 } }], edges: [] }],
  };
  await page.addInitScript(value => localStorage.setItem('solocanvas.workspace.v2', JSON.stringify(value)), workspace);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByLabel('Find components across boards').fill('findrareservice');
  const results = page.getByRole('region', { name: 'Component search results' });
  await expect(results).toContainText('No matching components');
  await page.getByLabel('Search imported source text').check();
  await expect(results).toContainText('src/main.ts');
  await results.getByRole('button', { name: 'Open on Files' }).click();
  await expect(page.getByRole('region', { name: 'Imported source text' })).toContainText('findRareService');
  await page.getByLabel('Search imported source text').uncheck();
  await expect(results).toContainText('No matching components');
});

test('folder selection can exclude generated files before applying the 100-file limit', async ({ page }) => {
 const folder = await mkdtemp(join(tmpdir(), 'solocanvas-filter-'));
 try {
  await mkdir(join(folder, 'src')); await mkdir(join(folder, 'node_modules'));
  await writeFile(join(folder, 'src', 'main.ts'), 'selected source');
  await Promise.all(Array.from({ length: 101 }, (_, i) => writeFile(join(folder, 'node_modules', 'file' + i + '.js'), 'generated')));
  await page.goto('/'); await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByLabel('Choose folder for map').setInputFiles(folder);
  const panel = page.getByRole('region', { name: 'Create file map' });
  await expect(panel).toContainText('101 file(s) excluded from generated folders');
  await expect(panel).toContainText('1 file(s) selected');
  await panel.getByText('101 file(s) excluded from generated folders').click();
  await expect(panel).toContainText('node_modules/file');
  const filter = page.getByLabel('Exclude common generated folders from folder selection');
  await filter.uncheck();
  await expect(panel.getByRole('alert')).toContainText('between 1 and 100 files');
  await expect(panel.getByRole('button', { name: 'Create file map board' })).toHaveCount(0);
  await filter.check();
  await expect(panel).toContainText('1 file(s) selected');
  page.once('dialog', dialog => dialog.accept('Filtered files'));
  await panel.getByRole('button', { name: 'Create file map board' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.locator('.react-flow__node').first()).toContainText('src/main.ts');
 } finally {
  await rm(folder, { recursive: true, force: true });
 }
});
