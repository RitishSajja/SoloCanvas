import { readFile } from 'node:fs/promises';
import { test, expect } from './returning-user-fixture.mjs';

const key = 'solocanvas.workspace.v2';
const position = (id, cardId, x, y) => ({ id, cardId, shape: 'rectangle', position: { x, y } });
const noteText = 'Review the café API';
const original = JSON.stringify({
  version: 3,
  cards: [
    { id: 'api', data: { label: 'API', kind: 'file', path: 'src/api.ts', sourceText: 'private source marker' },
      attachments: [{ id: 'file', name: 'internal.bin', size: 6, base64: 'AP8TDXIh' }] },
    { id: 'worker', data: { label: 'Worker' } },
  ],
  boards: [
    { id: 'map', title: 'Service map', parentPlacement: null, extra: {},
      nodes: [position('api-left', 'api', -180, 20), position('worker-node', 'worker', 150, 20), position('api-right', 'api', 600, 20)],
      notes: [
        { id: 'observation', text: noteText, position: { x: -170, y: 210 } },
        { id: 'other-note', text: 'Out-of-region note', position: { x: 720, y: 230 } },
      ],
      edges: [
        { id: 'within', source: 'api-left', target: 'worker-node', label: 'dispatches' },
        { id: 'crossing', source: 'worker-node', target: 'api-right', label: 'returns' },
      ],
    },
    { id: 'other', title: 'Another board', extra: {}, parentPlacement: null, nodes: [], notes: [], edges: [] },
  ],
});

async function openContext(page) {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.addInitScript(([key, saved]) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, saved);
  }, [key, original]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open board Service map' }).click();
  await page.getByRole('button', { name: 'Board tools', exact: true }).click();
  await page.getByText('Board context', { exact: true }).click();
  return page.getByRole('textbox', { name: 'Board context JSON' });
}

async function expectStorageUntouched(page) {
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(original);
  expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.backup.v2'))).toBeNull();
}

async function expectDownloadedJson(page, expected) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download context JSON' }).click();
  const file = await pending;
  expect(await readFile(await file.path(), 'utf8')).toBe(expected);
}

test('set a region by keyboard and review the same filtered data in the download and question', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.copiedRegionContext = text; },
    } });
  });
  const preview = await openContext(page);
  const region = page.getByRole('checkbox', { name: 'Rectangular region' });
  const download = page.getByRole('button', { name: 'Download context JSON' });
  await region.focus();
  await region.press('Space');
  await expect(preview).toHaveCount(0);
  await expect(download).toBeDisabled();
  const coordinates = [['Region X', '-190'], ['Region Y', '10'], ['Region width', '430'], ['Region height', '260']];
  for (const [label, value] of coordinates) {
    const input = page.getByRole('spinbutton', { name: label, exact: true });
    await input.focus();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
  }
  const json = JSON.parse(await preview.inputValue());
  expect(json.scope).toEqual({ kind: 'region', x: -190, y: 10, width: 430, height: 260 });
  expect(json.placements.map(item => item.id)).toEqual(['api-left', 'worker-node']);
  expect(json.components.map(item => item.id)).toEqual(['api', 'worker']);
  expect(json.relationships.map(item => item.id)).toEqual(['within']);
  expect(json.notes).toEqual([{ id: 'observation', position: { x: -170, y: 210 } }]);

  const disclosure = page.getByRole('checkbox', { name: 'Include sticky note text' });
  await expect(disclosure).not.toBeChecked();
  await disclosure.check();
  const reviewedJson = await preview.inputValue();
  expect(JSON.parse(reviewedJson).notes[0].text).toBe(noteText);
  for (const hidden of ['api-right', 'crossing', 'Out-of-region note', 'private source marker', 'internal.bin', 'AP8TDXIh']) {
    expect(reviewedJson).not.toContain(hidden);
  }
  await expectDownloadedJson(page, reviewedJson);
  await page.getByRole('button', { name: 'Draft architecture question' }).click();
  await page.getByRole('textbox', { name: 'Architecture question', exact: true }).fill('What calls the worker?');
  const question = page.getByRole('textbox', { name: 'Question and context' });
  const reviewedQuestion = 'Question\nWhat calls the worker?\n\nBoard context\n' + reviewedJson;
  await expect(question).toHaveValue(reviewedQuestion);
  const copy = page.getByRole('button', { name: 'Copy question and context' });
  await copy.click();
  expect(await page.evaluate(() => window.copiedRegionContext)).toBe(reviewedQuestion);

  const width = page.getByRole('spinbutton', { name: 'Region width', exact: true });
  await width.fill('0');
  await expect(preview).toHaveCount(0);
  await expect(download).toBeDisabled();
  await expect(copy).toBeDisabled();
  await width.fill('430');
  await page.getByRole('spinbutton', { name: 'Region X', exact: true }).fill('9000');
  const empty = JSON.parse(await preview.inputValue());
  expect(empty).toMatchObject({ scope: { kind: 'region', x: 9000 }, placements: [], components: [], notes: [], relationships: [] });
  await expect(question).toHaveValue('Question\nWhat calls the worker?\n\nBoard context\n' + await preview.inputValue());
  await region.uncheck();
  await expect(disclosure).not.toBeChecked();
  const fullBoard = JSON.parse(await preview.inputValue());
  expect(fullBoard.scope).toEqual({ kind: 'board' });
  expect(fullBoard.notes.map(note => note.id)).toEqual(['observation', 'other-note']);
  for (const note of fullBoard.notes) expect(note).not.toHaveProperty('text');
  await expect(question).not.toHaveValue(/Review the café API|Out-of-region note/);
  await disclosure.check();
  await expect(question).toHaveValue(/Out-of-region note/);
  await page.getByLabel('Current board').selectOption('other');
  await expect(region).not.toBeChecked();
  await expect(disclosure).not.toBeChecked();
  expect(JSON.parse(await preview.inputValue()).scope).toEqual({ kind: 'board' });
  await expect(question).toHaveCount(0);
  await expectStorageUntouched(page);
});

test('draw and cancel a region on a panned and zoomed canvas', async ({ page }) => {
  const preview = await openContext(page);
  const pane = page.locator('.react-flow__pane');
  const viewport = page.locator('.react-flow__viewport');
  const transform = () => viewport.evaluate(element => getComputedStyle(element).transform);
  const beforePan = await transform();
  const bounds = await pane.boundingBox();
  await page.mouse.move(bounds.x + 30, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 95, bounds.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect.poll(transform).not.toBe(beforePan);
  const beforeZoom = await transform();
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).click();
  await expect.poll(transform).not.toBe(beforeZoom);
  await page.getByRole('checkbox', { name: 'Rectangular region' }).check();
  const draw = page.getByRole('button', { name: 'Draw region on canvas' });
  await draw.click();
  const surface = page.locator('.context-region-draw');
  await expect(surface).toBeVisible();
  const worker = page.locator('.react-flow__node[data-id="component:worker-node"]');
  const { x, y, zoom } = await worker.evaluate(async element => {
    // React Flow animates zoom. Measure once the visible node has settled.
    let previous = element.getBoundingClientRect().x;
    let stable = 0;
    while (stable < 3) {
      await new Promise(requestAnimationFrame);
      const current = element.getBoundingClientRect().x;
      stable = Math.abs(current - previous) < 0.01 ? stable + 1 : 0;
      previous = current;
    }
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, zoom: rect.width / element.offsetWidth };
  });
  // Both corners lie inside the worker; its top-left origin is outside the selection.
  await page.mouse.move(x + 60 * zoom, y + 60 * zoom);
  await page.mouse.down();
  await page.mouse.move(x + 22 * zoom, y + 22 * zoom, { steps: 5 });
  await page.mouse.up();
  const displayed = await preview.inputValue();
  const data = JSON.parse(displayed);
  expect(data.placements.map(item => item.id)).toEqual(['worker-node']);
  expect(data.relationships).toEqual([]);
  expect(data.scope.kind).toBe('region');
  for (const [field, expected] of Object.entries({ x: 172, y: 42, width: 38, height: 38 })) {
    expect(Math.abs(data.scope[field] - expected)).toBeLessThan(3);
  }
  await draw.click();
  await page.mouse.move(x + 22 * zoom, y + 22 * zoom);
  await page.mouse.down();
  await page.mouse.move(x + 45 * zoom, y + 45 * zoom);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(surface).toBeHidden();
  await expect(preview).toHaveValue(displayed);
  await expectStorageUntouched(page);
});
