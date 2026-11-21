import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { BOARD_KEY, BACKUP_KEY, WORKSPACE_KEY, WORKSPACE_BACKUP_KEY, WORKSPACE_DAMAGED_KEY, ONBOARDING_KEY } from '../src/storage.mjs';
import { migrateLegacyBoard } from '../src/workspace.mjs';

async function prepareFreshInstall(page) {
  await page.addInitScript(token => {
    if (sessionStorage.getItem(token) === 'done') return;
    localStorage.clear();
    sessionStorage.setItem(token, 'done');
  }, `__onboarding_test_${randomUUID()}`);
}

test('first-run sample is optional, stays unsaved until requested, then reloads as the saved board', async ({ page }) => {
  await prepareFreshInstall(page);
  await page.goto('/');
  const initial = await page.evaluate(async () => (await import('/src/storage.mjs')).loadBoard());
  expect(initial.firstRun).toBe(true);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your canvas starts with you.' })).toBeVisible();
  expect(await page.evaluate(() => [
    'solocanvas.board.v1',
    'solocanvas.board.backup.v1',
    'solocanvas.workspace.v2',
    'solocanvas.workspace.backup.v2',
    'solocanvas.workspace.damaged.v2',
  ].every(key => localStorage.getItem(key) === null))).toBe(true);

  await page.getByRole('button', { name: 'Explore the sample board' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  await expect(page.getByRole('heading', { name: 'Example architecture' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('stays in memory');
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.board.v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.onboarding.v1'))).toBeNull();

  await page.getByRole('button', { name: 'Save board' }).click();
  await expect(page.getByRole('status')).toContainText('Saved on this device');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solocanvas.board.v1')));
  expect(saved.nodes).toHaveLength(8);
  expect(saved.edges).toHaveLength(7);
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
});

test('blank choice is remembered without creating or replacing a board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareFreshInstall(page);
  await page.goto('/');
  const card = await page.locator('.welcome-card').boundingBox();
  expect(card).not.toBeNull();
  expect(card.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: 'Start with a blank canvas' })).toBeVisible();
  await page.getByRole('button', { name: 'Start with a blank canvas' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.board.v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.onboarding.v1'))).toBe('complete');
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
});

test('saved v1 data bypasses onboarding and remains unchanged', async ({ page }) => {
  const raw = JSON.stringify({
    nodes: [{ id: 'legacy', position: { x: 20, y: 30 }, data: { label: 'Saved v1 component' } }],
    edges: [],
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: BOARD_KEY, value: raw });
  await page.goto('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Saved v1 component' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(raw);
  expect(await page.evaluate(key => localStorage.getItem(key), ONBOARDING_KEY)).toBeNull();
});

test('saved v2 workspace and its v1/v2 recovery records bypass onboarding unchanged', async ({ page }) => {
  const legacyRaw = JSON.stringify({
    nodes: [{ id: 'old', position: { x: 20, y: 30 }, data: { label: 'Saved legacy component' } }],
    edges: [],
  });
  const backupRaw = JSON.stringify({ nodes: [], edges: [] });
  const workspaceSourceRaw = JSON.stringify({
    nodes: [{ id: 'v2', position: { x: 40, y: 50 }, data: { label: 'Saved v2 component' } }],
    edges: [],
  });
  const workspaceRaw = JSON.stringify(migrateLegacyBoard(workspaceSourceRaw, { title: 'Saved v2 board' }));
  const workspaceBackupRaw = JSON.stringify(migrateLegacyBoard(backupRaw, { title: 'Previous v2 board' }));
  const damagedRaw = '{preserved damaged workspace}';
  await page.addInitScript((values) => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }, {
    [BOARD_KEY]: legacyRaw,
    [BACKUP_KEY]: backupRaw,
    [WORKSPACE_KEY]: workspaceRaw,
    [WORKSPACE_BACKUP_KEY]: workspaceBackupRaw,
    [WORKSPACE_DAMAGED_KEY]: damagedRaw,
  });
  await page.goto('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('read-only');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Saved v2 component' })).toBeVisible();
  const stored = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), [
    BOARD_KEY, BACKUP_KEY, WORKSPACE_KEY, WORKSPACE_BACKUP_KEY, WORKSPACE_DAMAGED_KEY, ONBOARDING_KEY,
  ]);
  expect(stored).toEqual({
    [BOARD_KEY]: legacyRaw,
    [BACKUP_KEY]: backupRaw,
    [WORKSPACE_KEY]: workspaceRaw,
    [WORKSPACE_BACKUP_KEY]: workspaceBackupRaw,
    [WORKSPACE_DAMAGED_KEY]: damagedRaw,
    [ONBOARDING_KEY]: null,
  });
});
