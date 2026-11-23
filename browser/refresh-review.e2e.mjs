import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect } from './returning-user-fixture.mjs';

const storage = 'solocanvas.workspace.v2';
const test = base.extend({
  tempDirectory: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'solocanvas-refresh-'));
    try { await use(directory); }
    finally { await rm(directory, { recursive: true, force: true }); }
  },
});

function legacyMap(files) {
  return { version: 3, cards: files.map((file, index) => ({
    id: String(index), data: { label: file.path, kind: 'file', ...file },
  })), boards: [{ id: 'board', title: 'Project map', parentPlacement: null, extra: {}, notes: [], edges: [],
    nodes: files.map((_, index) => ({ id: String(index), cardId: String(index), shape: 'pill', position: { x: index * 320, y: 0 } })),
  }] };
}

async function seedMap(page, workspace) {
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, { key: storage, value: JSON.stringify(workspace) });
  await page.goto('/');
}

async function openRefresh(page) {
  await page.getByRole('button', { name: 'Open board Project map' }).click();
  await page.getByRole('button', { name: 'Board tools', exact: true }).click();
  await page.getByText('Refresh code map', { exact: true }).click();
  return page.getByRole('region', { name: 'Refresh code map' });
}

test('refresh rejects another folder, respects generated exclusions, and keeps edits made while reading', async ({ page, tempDirectory }) => {
  const folder = join(tempDirectory, 'project');
  const other = join(tempDirectory, 'unrelated');
  await mkdir(join(folder, 'dist'), { recursive: true });
  await mkdir(other, { recursive: true });
  await writeFile(join(folder, 'entry.ts'), 'export const value = 2;');
  await writeFile(join(folder, 'dist', 'new.js'), 'export {};');
  await writeFile(join(other, 'entry.ts'), 'export const value = 3;');

  const paths = ['project/entry.ts', 'project/dist/old.js'];
  const workspace = legacyMap(paths.map(path => ({ path, sourceText: 'export const value = 1;' })));
  const saved = JSON.stringify(workspace);
  await seedMap(page, workspace);
  const panel = await openRefresh(page);
  const picker = panel.getByLabel('Refresh folder');
  const preview = panel.getByRole('button', { name: 'Preview file changes' });
  const readSaved = () => page.evaluate(key => localStorage.getItem(key), storage);
  await picker.setInputFiles(other);
  await preview.click();
  await expect(panel.getByRole('alert')).toContainText(/original|originally/);
  expect(await readSaved()).toBe(saved);

  await picker.setInputFiles(folder);
  await preview.click();
  await expect(panel.getByRole('checkbox', { name: 'Record file details project/entry.ts', exact: true })).not.toBeChecked();
  await expect(panel.getByRole('checkbox', { name: /project\/dist\// })).toHaveCount(0);
  await panel.getByLabel('Exclude generated folders').uncheck();
  await preview.click();
  await expect(panel.getByRole('checkbox', { name: 'Missing project/dist/old.js', exact: true })).toBeVisible();
  await expect(panel.getByRole('checkbox', { name: 'Added project/dist/new.js', exact: true })).toBeVisible();
  await panel.getByLabel('Exclude generated folders').check();
  await panel.getByLabel('Read source text for refresh').check();
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      File.prototype.arrayBuffer = original;
      await new Promise(resolve => { window.finishRefreshRead = resolve; });
      return original.call(this);
    };
  });
  await preview.click();
  await page.waitForFunction(() => typeof window.finishRefreshRead === 'function');
  await page.getByRole('button', { name: 'Add sticky note' }).click();
  await page.evaluate(() => window.finishRefreshRead());
  await expect(panel.getByRole('alert')).toContainText('workspace changed');
  await expect(panel.getByRole('button', { name: 'Apply selected changes' })).toHaveCount(0);
  await expect(page.getByLabel('Sticky note text')).toHaveCount(1);
  expect(await readSaved()).toBe(saved);
});

test('path-only refresh records an older map’s file details and saves a changed binary after review', async ({ page, tempDirectory }) => {
  const folder = join(tempDirectory, 'project');
  const file = join(folder, 'asset.bin');
  await mkdir(folder);
  await writeFile(file, Buffer.from([0, 255]));
  await writeFile(join(folder, 'keep.bin'), Buffer.from([0, 1]));
  const workspace = legacyMap([{ path: 'project/asset.bin' }, { path: 'project/keep.bin' }]);
  await seedMap(page, workspace);
  const readSaved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storage);
  const panel = await openRefresh(page);
  const preview = async () => {
    await panel.getByLabel('Refresh folder').setInputFiles(folder);
    await expect(panel.getByLabel('Read source text for refresh')).not.toBeChecked();
    await panel.getByRole('button', { name: 'Preview file changes' }).click();
  };
  const apply = panel.getByRole('button', { name: 'Apply selected changes' });
  const save = async () => {
    await page.getByRole('button', { name: 'Save workspace' }).click();
    await expect(page.getByRole('status')).toContainText('Workspace saved');
  };
  await preview();
  const baseline = panel.getByRole('checkbox', { name: 'Record file details project/asset.bin', exact: true });
  await expect(baseline).not.toBeChecked();
  await baseline.check();
  await panel.getByRole('checkbox', { name: 'Record file details project/keep.bin', exact: true }).check();
  await apply.click();
  expect(await readSaved()).toEqual(workspace);
  await save();
  const recorded = await readSaved();
  expect(recorded.boards[0].nodes[0].fileDetails).toEqual({ size: 2, lastModified: expect.any(Number) });

  await writeFile(file, Buffer.from([0, 255, 254, 1]));
  await page.reload();
  await openRefresh(page);
  await preview();
  const changed = panel.getByRole('checkbox', { name: 'Changed project/asset.bin', exact: true });
  await expect(changed).not.toBeChecked();
  await expect(panel.getByRole('checkbox', { name: /project\/keep\.bin/ })).toHaveCount(0);
  await expect(apply).toBeDisabled();
  await changed.check();
  await apply.click();
  expect(await readSaved()).toEqual(recorded);
  await save();
  const refreshed = await readSaved();
  expect(refreshed.boards[0].nodes[0].fileDetails.size).toBe(4);
  expect(refreshed.cards).toEqual(workspace.cards);
  await page.reload();
  await openRefresh(page);
  await preview();
  await expect(panel).toContainText('No file changes found.');
});
