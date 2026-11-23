import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from './returning-user-fixture.mjs';

const key = 'solocanvas.workspace.v2';
const node = (id, cardId, x) => ({ id, cardId, shape: 'rounded', position: { x, y: 40 } });
const file = (id, sourceText = '') => ({ id, data: { kind: 'file', label: id + '.ts', path: 'repo/' + id + '.ts', sourceText } });
const board = (id, title, nodes, parentPlacement = null) => ({ id, title, nodes, notes: [], edges: [], extra: {}, parentPlacement });
const source = "import './old';";
const updated = "// dependency moved\nimport './next';";
const manual = { id: 'manual', source: 'old-node', target: 'main-node', label: 'documents' };
const nested = board('map', 'Source files', [node('main-node', 'main', 20), node('old-node', 'old', 350), node('next-node', 'next', 700)],
  { boardId: 'services', nodeId: 'package-node' });
nested.notes.push({ id: 'note', text: 'Keep release sequence', position: { x: 60, y: 230 } });
nested.edges.push(manual, { id: 'observed', source: 'main-node', target: 'old-node', label: 'imports',
  data: { sourcePath: 'repo/main.ts', targetPath: 'repo/old.ts', specifier: './old', line: 1, importKind: 'static' } });
const deployment = board('deploy', 'Deployment', [node('deployed', 'next', 20), node('consumer', 'runner', 340)]);
deployment.edges.push({ id: 'runtime', source: 'deployed', target: 'consumer', label: 'starts' });
const seed = { version: 3, cards: [
  { id: 'services', data: { label: 'Services' } }, { id: 'package', data: { label: 'Package' } },
  file('main', source), file('old'), file('next'), { id: 'runner', data: { label: 'Runner' } },
], boards: [board('project', 'Project', [node('entry', 'services', 0)]),
  board('services', 'Services board', [node('package-node', 'package', 0)], { boardId: 'project', nodeId: 'entry' }), nested, deployment] };

test('refresh a saved nested code map, review import evidence, and explore across boards after reload', async ({ page }) => {
  test.setTimeout(90000);
  const temp = await mkdtemp(join(tmpdir(), 'solocanvas-refresh-'));
  const folder = join(temp, 'repo');
  const bytes = Buffer.from([0, 255, 13, 10, 7]);
  try {
    await mkdir(folder);
    await Promise.all([['main.ts', updated], ['next.ts', ''], ['old.ts', ''], ['extra.md', '# Extra']].map(
      ([path, value]) => writeFile(join(folder, path), value)));
    await page.addInitScript(([storageKey, initial]) => {
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(initial));
    }, [key, seed]);
    const current = page.getByLabel('Current board');
    const card = id => page.locator('.react-flow__node[data-id="component:' + id + '"]');
    async function drill() {
      await page.getByRole('button', { name: 'Open board Project', exact: true }).click();
      await card('entry').press('Control+Enter');
      await expect(current).toHaveValue('services');
      await card('package-node').press('Control+Enter');
      await expect(current).toHaveValue('map');
      await expect(page.getByRole('navigation', { name: 'Workspace breadcrumbs' })).toContainText('Package');
    }
    const main = card('main-node');
    const files = main.getByRole('group', { name: 'Component files' });
    const getBytes = async () => {
      const download = page.waitForEvent('download');
      await files.getByRole('button', { name: 'Download spec.bin' }).click();
      const result = await download;
      expect(result.suggestedFilename()).toBe('spec.bin');
      expect(await readFile(await result.path())).toEqual(bytes);
    };
    await page.goto('/');
    await drill();
    await main.locator('strong').click();
    await main.getByRole('textbox', { name: 'Shared component name' }).fill('Public API');
    await main.getByRole('textbox', { name: 'Shared component name' }).press('Enter');
    await files.locator('summary').click();
    await files.getByLabel('Attach component file').setInputFiles({ name: 'spec.bin', mimeType: 'application/octet-stream', buffer: bytes });
    await getBytes();
    await files.locator('summary').click();
    await page.getByRole('button', { name: 'Board tools', exact: true }).click();
    await page.getByText('Refresh code map', { exact: true }).click();
    await page.getByLabel('Refresh folder').setInputFiles(folder);
    await page.getByLabel('Read source text for refresh').check();
    await page.getByRole('button', { name: 'Preview file changes' }).click();
    await page.getByRole('checkbox', { name: 'Changed repo/main.ts', exact: true }).check();
    await expect(page.getByRole('checkbox', { name: 'Added repo/extra.md', exact: true })).not.toBeChecked();
    await page.getByRole('button', { name: 'Review dependency changes' }).click();
    await page.getByRole('checkbox', { name: 'Added dependency repo/main.ts → repo/next.ts', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Removed dependency repo/main.ts → repo/old.ts', exact: true }).check();
    await page.getByRole('button', { name: 'Apply selected changes' }).click();
    await expect(main).toContainText('Public API');
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).cards.find(c => c.id === 'main').data.sourceText, key)).toBe(source);
    await page.getByRole('button', { name: 'Save workspace' }).click();
    await expect(page.getByRole('status')).toContainText('Workspace saved');
    await page.reload();
    await drill();
    await expect(main).toContainText('Public API');
    await files.locator('summary').click();
    await getBytes();
    await files.locator('summary').click();
    await main.getByText('View source', { exact: true }).click();
    await expect(main.getByLabel('Source for repo/main.ts')).toHaveText(updated);
    await main.getByText('View source', { exact: true }).click();
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    const map = saved.boards.find(b => b.id === 'map');
    expect(map.nodes.map(n => n.position)).toEqual(nested.nodes.map(n => n.position));
    expect(map.notes).toEqual(nested.notes);
    expect(map.edges).toContainEqual(manual);
    expect(map.edges.find(e => e.id === 'observed')).toBeUndefined();
    expect(map.edges.find(e => e.target === 'next-node').data).toMatchObject({ specifier: './next', line: 2 });
    expect(saved.cards.find(c => c.id === 'main').data.sourceText).toBe(updated);
    expect(saved.cards.some(c => c.data.path === 'repo/extra.md')).toBe(false);
    await expect(page.locator('.react-flow__edge.inferred-dependency')).toHaveCount(1);
    await expect(page.locator('.react-flow__edge.manual-relationship')).toHaveCount(1);
    await main.press('Enter');
    await main.getByRole('textbox').press('Escape');
    await page.getByRole('button', { name: 'Board tools', exact: true }).click();
    await page.getByText('Dependency explorer', { exact: true }).click();
    const outgoing = page.getByRole('region', { name: 'Depends on', exact: true });
    await expect(outgoing).toContainText('repo/main.ts:2');
    await expect(page.getByRole('region', { name: 'Used by', exact: true })).toContainText('old.ts on Source files');
    await outgoing.getByRole('button', { name: 'Show next level for next.ts' }).click();
    await outgoing.getByRole('button', { name: 'Runner on Deployment' }).click();
    await expect(current).toHaveValue('deploy');
    await expect(page.locator('.workspace-component-node.selected')).toContainText('Runner');

    const incoming = page.getByRole('region', { name: 'Used by', exact: true });
    await expect(incoming.getByRole('button', { name: 'next.ts on Deployment' })).toBeVisible();
    await incoming.getByRole('button', { name: 'Show next level for next.ts' }).click();
    await expect(incoming).toContainText('repo/main.ts:2');
    await incoming.getByRole('button', { name: 'Public API on Source files' }).click();
    await expect(current).toHaveValue('map');
    await expect(main).toHaveClass(/\bselected\b/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
