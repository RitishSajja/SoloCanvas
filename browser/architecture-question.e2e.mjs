import { test, expect } from './returning-user-fixture.mjs';

const storageKey = 'solocanvas.workspace.v2';
const privateNote = 'Private review Δ';
const attachment = { id: 'doc', name: 'private.bin', size: 6, base64: 'AP8TDXIh' };
const original = JSON.stringify({
  version: 3,
  cards: [
    { id: 'api', data: { label: 'API', kind: 'file', path: 'api.ts', sourceText: 'source-secret-42' }, attachments: [attachment] },
    { id: 'worker', data: { label: 'Worker' } },
  ],
  boards: [
    { id: 'system', title: 'System', extra: {}, parentPlacement: null,
      nodes: ['api', 'worker'].map((id, index) => ({ id, cardId: id, shape: 'pill', position: { x: index * 320, y: 0 } })),
      notes: [{ id: 'note', position: { x: 0, y: 180 }, text: privateNote }], edges: [] },
    { id: 'other', title: 'Other', extra: {}, parentPlacement: null, nodes: [], notes: [], edges: [] },
  ],
});

async function openDraft(page) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: original });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open board System' }).click();
  await page.getByRole('button', { name: 'Board tools', exact: true }).click();
  await page.getByText('Board context', { exact: true }).click();
  const start = page.getByRole('button', { name: 'Draft architecture question' });
  await start.click();
  return {
    start,
    question: page.getByRole('textbox', { name: 'Architecture question', exact: true }),
    context: page.getByRole('textbox', { name: 'Board context JSON' }),
    combined: page.getByRole('textbox', { name: 'Question and context', exact: true }),
    copy: page.getByRole('button', { name: 'Copy question and context' }),
    discard: page.getByRole('button', { name: 'Discard draft' }),
  };
}

async function expectSavedWorkspaceUntouched(page) {
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(original);
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.backup.v2'))).toBeNull();
}

test('copy exactly the reviewed question and context, with explicit note disclosure', async ({ page, context, baseURL }) => {
  // Keep a developer's desktop clipboard untouched. CI runs a single suite at a time
  // in an isolated Linux runner, where this also exercises Chromium's native clipboard.
  if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'linux') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL).origin });
  } else {
    await page.addInitScript(() => {
      let contents = '';
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        readText: async () => contents,
        writeText: async text => { contents = text; },
      } });
    });
  }
  const draft = await openDraft(page);
  await page.bringToFront();
  await page.evaluate(() => navigator.clipboard.writeText('previous clipboard'));
  await draft.question.fill(' \n ');
  await expect(draft.copy).toBeDisabled();
  const question = ' Which service owns Δ?\nExplain its role. ';
  await draft.question.fill(question);
  await page.getByRole('button', { name: 'Close board tools' }).click();
  await expect(draft.question).toBeHidden();
  await page.getByRole('button', { name: 'Board tools', exact: true }).click();
  await expect(draft.question).toHaveValue(question);
  await expect(draft.combined).toHaveJSProperty('readOnly', true);
  await expect(draft.combined).toHaveValue('Question\n' + question + '\n\nBoard context\n' + await draft.context.inputValue());
  const before = await draft.combined.inputValue();
  for (const hidden of [privateNote, attachment.base64, attachment.name, 'source-secret-42']) expect(before).not.toContain(hidden);
  await page.getByLabel('Include sticky note text').check();
  await expect(draft.combined).toHaveValue(/Private review Δ/);
  const reviewed = 'Question\n' + question + '\n\nBoard context\n' + await draft.context.inputValue();
  await expect(draft.combined).toHaveValue(reviewed);
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  expect(await clipboard()).toBe('previous clipboard');
  await draft.copy.click();
  await expect.poll(clipboard).toBe(reviewed);
  await expect(page.getByText('Question and context copied.', { exact: true })).toBeVisible();
  await draft.discard.click();
  await expect(draft.question).toHaveCount(0);
  await draft.start.click();
  await expect(draft.question).toHaveValue('');
  await expect(draft.copy).toBeDisabled();
  await draft.discard.click();
  await page.getByRole('button', { name: 'Close board tools' }).click();
  await expect(page.getByRole('button', { name: 'Board tools', exact: true })).toHaveAttribute('aria-expanded', 'false');
  expect(await clipboard()).toBe(reviewed);
  await expectSavedWorkspaceUntouched(page);
});

test('changes of placement update the draft and losing the selected scope blocks copy', async ({ page }) => {
  const draft = await openDraft(page);
  const connected = page.getByLabel('Only connected placements');
  await draft.question.fill('Which connections can I see?');
  async function selectPlacement(id) {
    const node = page.locator('.react-flow__node[data-id="component:' + id + '"]');
    await node.press('Enter');
    await node.getByRole('textbox', { name: 'Shared component name' }).press('Escape');
  }
  await selectPlacement('api');
  await connected.check();
  await expect(draft.combined).toHaveValue(/"placementId": "api"/);
  await expect(draft.combined).not.toHaveValue(/Worker/);
  await selectPlacement('worker');
  await expect(draft.combined).toHaveValue(/"placementId": "worker"/);
  await expect(draft.combined).not.toHaveValue(/api\.ts/);
  await page.getByRole('textbox', { name: 'Sticky note text' }).focus();
  await expect(draft.copy).toBeDisabled();
  await expect(draft.combined).toHaveCount(0);
  await page.getByLabel('Current board').selectOption('other');
  await expect(draft.start).toBeVisible();
  await draft.start.click();
  await expect(draft.question).toHaveValue('');
  await expect(draft.context).toHaveValue(/"title": "Other"/);
  await expectSavedWorkspaceUntouched(page);
});

test('clipboard denial selects the current preview for manual copy and ignores stale failures', async ({ page }) => {
  await page.addInitScript(() => {
    window.attempts = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: text => new Promise((resolve, reject) => {
        window.attempts.push(text);
        window.denyCopy = () => reject(new DOMException('Clipboard denied', 'NotAllowedError'));
      }),
    } });
  });
  const draft = await openDraft(page);
  await draft.question.fill('First question?');
  await draft.copy.click();
  await draft.question.fill('Replacement question?');
  await page.evaluate(() => window.denyCopy());
  await expect(draft.question).toBeFocused();
  const current = await draft.combined.inputValue();
  await draft.copy.click();
  expect(await page.evaluate(() => window.attempts.at(-1))).toBe(current);
  await page.evaluate(() => window.denyCopy());
  await expect(draft.combined).toBeFocused();
  await expect(page.getByText('Copy manually from Question and context.', { exact: true })).toBeVisible();
  expect(await draft.combined.evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd))).toBe(current);
  await expectSavedWorkspaceUntouched(page);
});
