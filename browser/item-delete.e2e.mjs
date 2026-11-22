import { test, expect } from './returning-user-fixture.mjs';

test('item delete icons protect the first board and explain nested contents before removal', async ({ page }) => {
  const storageKey = 'solocanvas.workspace.v2';
  const position = { x: 0, y: 0 };
  const file = { id: 'file', name: 'sample.bin', size: 1, base64: 'AQ==' };
  const shared = { id: 'shared', data: { label: 'Gateway' }, attachments: [file] };
  const placement = { id: 'p', cardId: shared.id, shape: 'diamond', position };
  const note = { id: 'n', text: 'Remember to verify', position: { x: 480, y: 0 } };
  const blank = { parentPlacement: null, extra: {}, nodes: [], notes: [], edges: [] };
  const seed = { version: 3, cards: [shared], boards: [
    { ...blank, id: 'home', title: 'Home', nodes: [placement] },
    { ...blank, id: 'other', title: 'Review', nodes: [placement], notes: [note], attachments: [file] },
    { ...blank, id: 'nested', title: 'Details', parentPlacement: { boardId: 'other', nodeId: 'p' }, notes: [note], attachments: [file] },
  ] };
  await page.addInitScript(({ key, initial }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));
  }, { key: storageKey, initial: seed });
  await page.goto('/');

  async function confirmDeletion(button, accept, phrases) {
    const dialogEvent = page.waitForEvent('dialog');
    const click = button.click();
    const dialog = await dialogEvent;
    const warning = dialog.message();
    await (accept ? dialog.accept() : dialog.dismiss());
    await click;
    for (const text of phrases) expect(warning).toContain(text);
  }
  const reviewTile = page.getByRole('article', { name: 'Board Review', exact: true });
  const deleteReview = page.getByRole('button', { name: 'Delete board Review', exact: true });
  await expect(page.getByRole('button', { name: 'Delete board Home' })).toHaveCount(0);
  await confirmDeletion(deleteReview, false, ['1 nested board', '1 component placement', '2 sticky notes', '2 board files', '1 component file stays']);
  await expect(reviewTile).toBeVisible();
  await reviewTile.press('Control+Enter');

  await page.getByRole('button', { name: 'Delete sticky note' }).click();
  await expect(page.getByRole('textbox', { name: 'Sticky note text' })).toHaveCount(0);
  const deleteComponent = page.getByRole('button', { name: 'Delete component Gateway' });
  await confirmDeletion(deleteComponent, false, ['1 nested board', '1 sticky note', '1 board file', '1 component file stays']);
  await expect(deleteComponent).toBeVisible();
  await page.getByRole('article', { name: 'Component Gateway', exact: true }).locator('strong').click();
  await page.getByRole('textbox', { name: 'Shared component name' }).fill('Edge gateway');
  await confirmDeletion(deleteComponent, true, ['1 nested board']);
  await expect(deleteComponent).toHaveCount(0);
  await confirmDeletion(deleteReview, true, ['1 board file']);
  await expect(page.getByLabel('Current board')).toHaveValue('home');
  await expect(page.getByRole('button', { name: 'Delete board Home' })).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), storageKey))).toEqual(seed);
  await page.getByRole('button', { name: 'Save workspace' }).click();
  await expect(page.getByRole('status')).toContainText('Workspace saved');
  await page.reload();
  await expect(reviewTile).toHaveCount(0);
  await page.getByRole('article', { name: 'Board Home', exact: true }).press('Control+Enter');
  await expect(page.getByRole('button', { name: 'Delete component Edge gateway', exact: true })).toBeVisible();
  const saved = JSON.parse(await page.evaluate(key => localStorage.getItem(key), storageKey));
  expect(saved.cards[0].attachments).toEqual([file]);
  expect(saved.boards.map(board => board.id)).toEqual(['home']);
});
