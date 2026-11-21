import { test, expect } from '@playwright/test';
import { openWorkspaceBoard } from './workspace-helpers.mjs';

test('Mermaid export downloads the current board without saving or including source text', async ({ page }) => {
 const workspace = { version: 2, cards: [
   { id: 'a', data: { label: 'API "gateway"', sourceText: 'PRIVATE SOURCE TEXT' } },
   { id: 'b', data: { label: 'Database' } },
 ], boards: [{ id: 'board', title: 'Architecture', extra: {}, nodes: [
   { id: 'n1', cardId: 'a', position: { x: 0, y: 0 } },
   { id: 'n2', cardId: 'b', position: { x: 400, y: 0 } },
 ], edges: [{ id: 'edge', source: 'n1', target: 'n2', label: 'reads | writes' }] }] };
 await page.addInitScript(value => localStorage.setItem('solocanvas.workspace.v2', JSON.stringify(value)), workspace);
 await page.goto('/'); await openWorkspaceBoard(page);
 const savedBefore = await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'));
 const pending = page.waitForEvent('download');
 await page.getByRole('button', { name: 'Export board as Mermaid' }).click();
 const download = await pending;
 expect(download.suggestedFilename()).toBe('solocanvas-board.mmd');
 const stream = await download.createReadStream(); const chunks = [];
 for await (const chunk of stream) chunks.push(chunk);
 const text = Buffer.concat(chunks).toString();
 expect(text).toBe('flowchart LR\n  n0["API #34;gateway#34;"]\n  n1["Database"]\n  n0 -->|reads #124; writes| n1\n');
 expect(text).not.toContain('PRIVATE SOURCE TEXT');
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBe(savedBefore);
 await expect(page.getByRole('status')).toContainText('Mermaid export started');
});

test('an empty board does not produce an empty flowchart', async ({ page }) => {
 await page.goto('/'); await openWorkspaceBoard(page);
 await page.getByRole('button', { name: 'Export board as Mermaid' }).click();
 await expect(page.getByRole('status')).toContainText('Add a component before exporting Mermaid');
 expect(await page.evaluate(() => localStorage.getItem('solocanvas.workspace.v2'))).toBeNull();
});
