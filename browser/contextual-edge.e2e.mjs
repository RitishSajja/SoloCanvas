import { test, expect } from './returning-user-fixture.mjs';

test('edit and remove a relationship directly from a board with its tools closed', async ({ page }) => {
  const key = 'solocanvas.workspace.v2';
  const seed = {
    version: 3,
    cards: ['API', 'Database'].map(id => ({ id, data: { label: id } })),
    boards: [{
      id: 'system', title: 'System', parentPlacement: null, extra: {}, notes: [],
      nodes: ['API', 'Database'].map((id, index) => ({ id, cardId: id, shape: 'pill', position: { x: index * 320, y: 0 } })),
      edges: [{ id: 'connection', source: 'API', target: 'Database', label: 'calls' }],
    }],
  };
  await page.addInitScript(({ key, seed }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed));
  }, { key, seed });
  const storedEdges = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)).boards[0].edges, key);
  const open = page.getByRole('button', { name: 'Open board System', exact: true });
  const edge = page.getByRole('group', { name: /Edge from/ });
  const actions = page.getByRole('group', { name: 'Selected relationship', exact: true });
  const save = page.getByRole('button', { name: 'Save workspace', exact: true });
  await page.goto('/');
  await open.click();
  await edge.click();
  await expect(page.getByRole('button', { name: 'Board tools', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await actions.getByLabel('Relationship label').fill('reads from');
  expect(await storedEdges()).toEqual(seed.boards[0].edges);
  await save.click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  await page.reload();
  await open.click();
  await edge.click();
  await expect(actions.getByLabel('Relationship label')).toHaveValue('reads from');
  await actions.getByRole('button', { name: 'Remove relationship' }).click();
  await expect(edge).toHaveCount(0);
  expect(await storedEdges()).toHaveLength(1);
  await save.click();
  await expect.poll(storedEdges).toEqual([]);
});
