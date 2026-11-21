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

function asV2(workspace) {
  return {
    version: 2,
    cards: workspace.cards,
    boards: workspace.boards.map(({ notes, parentPlacement, nodes, ...board }) => ({
      ...board,
      parentPlacement,
      nodes: nodes.map(({ shape, ...node }) => node),
    })),
  };
}

test('first-run sample becomes an unsaved workspace board until explicitly saved', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'Pick up where your ideas live.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open board Example architecture' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Select Save workspace');
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.board.v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.onboarding.v1'))).toBe('complete');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved on this device.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solocanvas.workspace.v2')));
  expect(saved.version).toBe(3);
  expect(saved.boards[0].nodes).toHaveLength(8);
  expect(saved.boards[0].edges).toHaveLength(7);
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open board Example architecture' })).toBeVisible();
  await page.getByRole('button', { name: 'Open board Example architecture' }).click();
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
  await expect(page.getByRole('heading', { name: 'Pick up where your ideas live.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open board My board' })).toBeVisible();
  await page.getByRole('button', { name: 'Open board My board' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.board.v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.onboarding.v1'))).toBe('complete');
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pick up where your ideas live.' })).toBeVisible();
});

test('sample choice is blocked if saved work appears in another tab after onboarding loads', async ({ page }) => {
  await prepareFreshInstall(page);
  await page.goto('/');
  await expect(page.getByRole('dialog')).toBeVisible();
  const raw = JSON.stringify({
    nodes: [{ id: 'later', position: { x: 20, y: 30 }, data: { label: 'Newer saved work' } }],
    edges: [],
  });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: BOARD_KEY, value: raw });
  await page.getByRole('button', { name: 'Explore the sample board' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Saved work appeared in another tab');
  expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(raw);
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
  await expect(page.getByRole('heading', { name: 'Pick up where your ideas live.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open board My board' }).click();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Saved v1 component' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(raw);
  expect(await page.evaluate(key => localStorage.getItem(key), ONBOARDING_KEY)).toBeNull();
});

test('default workspace offers v1 backup recovery only after explicit restore', async ({ page }) => {
  const damagedRaw = '{broken legacy board}';
  const backupRaw = JSON.stringify({
    nodes: [{ id: 'recovered', position: { x: 20, y: 30 }, data: { label: 'Recovered component' } }],
    edges: [],
  });
  const token = `__legacy_recovery_${randomUUID()}`;
  await page.addInitScript(({ boardKey, backupKey, damaged, backup, token: once }) => {
    if (sessionStorage.getItem(once) === 'done') return;
    localStorage.setItem(boardKey, damaged);
    localStorage.setItem(backupKey, backup);
    sessionStorage.setItem(once, 'done');
  }, { boardKey: BOARD_KEY, backupKey: BACKUP_KEY, damaged: damagedRaw, backup: backupRaw, token });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pick up where your ideas live.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore previous board backup' })).toBeVisible();
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, BACKUP_KEY]))
    .toEqual([damagedRaw, backupRaw]);

  await page.getByRole('button', { name: 'Restore previous board backup' }).click();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(backupRaw);
  await expect(page.getByRole('button', { name: 'Open board My board' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), BACKUP_KEY)).toBe(backupRaw);
  expect(await page.evaluate(key => localStorage.getItem(key), WORKSPACE_KEY)).toBeNull();
  await page.getByRole('button', { name: 'Open board My board' }).click();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Recovered component' })).toBeVisible();
});

test('saved v2 workspace and its v1/v2 recovery records bypass onboarding unchanged', async ({ page }) => {
  const legacyRaw = '{preserved unreadable legacy board}';
  const backupRaw = JSON.stringify({ nodes: [], edges: [] });
  const workspaceSourceRaw = JSON.stringify({
    nodes: [{ id: 'v2', position: { x: 40, y: 50 }, data: { label: 'Saved v2 component' } }],
    edges: [],
  });
  const workspaceRaw = JSON.stringify(asV2(migrateLegacyBoard(workspaceSourceRaw, { title: 'Saved v2 board' })));
  const workspaceBackupRaw = JSON.stringify(asV2(migrateLegacyBoard(backupRaw, { title: 'Previous v2 board' })));
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
  await expect(page.getByRole('heading', { name: 'Pick up where your ideas live.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore previous board backup' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open board Saved v2 board' }).click();
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
