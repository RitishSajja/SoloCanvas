import { test, expect } from './returning-user-fixture.mjs';
import { exportBoardMermaid } from '../src/mermaid-export.mjs';

// The isolated verification dependency is installed only for this compatibility check.
test.skip(!process.env.MERMAID_BUNDLE, 'Set MERMAID_BUNDLE to a local Mermaid browser bundle.');

test('exported flowcharts render safe labels in Mermaid 11', async ({ page }) => {
 const workspace = { version: 2, cards: [
  { id: 'a', data: { label: 'API "gateway" & café 😀' } },
  { id: 'b', data: { label: '"]\nclick n0 "https://example.com"' } },
 ], boards: [{ id: 'board', title: 'Architecture', extra: {}, nodes: [
  { id: 'n1', cardId: 'a', position: { x: 0, y: 0 } },
  { id: 'n2', cardId: 'b', position: { x: 400, y: 0 } },
 ], edges: [{ id: 'edge', source: 'n1', target: 'n2', label: 'reads | writes' }] }] };
 const diagram = exportBoardMermaid(workspace, 'board');
 await page.goto('/');
 await page.addScriptTag({ path: process.env.MERMAID_BUNDLE });
 const rendered = await page.evaluate(async text => {
  window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  const { svg } = await window.mermaid.render('solocanvasCompatibility', text);
  const root = document.createElement('div');
  root.innerHTML = svg;
  return { text: root.textContent, links: root.querySelectorAll('a').length,
   nodes: root.querySelectorAll('.node').length, edges: root.querySelectorAll('path.flowchart-link').length };
 }, diagram);
 expect(rendered.nodes).toBe(2);
 expect(rendered.edges).toBe(1);
 expect(rendered.text).toContain('API "gateway" & café 😀');
 expect(rendered.text).toContain('reads | writes');
 expect(rendered.text).toContain('click n0');
 expect(rendered.links).toBe(0);
});
