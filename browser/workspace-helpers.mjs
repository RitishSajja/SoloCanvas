import { expect } from '@playwright/test';

export async function openWorkspaceBoard(page, { expandTools = true } = {}) {
  const legacyWorkspaceButton = page.getByRole('button', { name: 'Open workspace' });
  const boardCards = page.getByRole('article', { name: /^Board / });
  await expect(legacyWorkspaceButton.or(boardCards.first())).toBeVisible();
  if (await legacyWorkspaceButton.isVisible()) await legacyWorkspaceButton.click();
  await expect(boardCards.first()).toBeVisible();
  await boardCards.first().press('Control+Enter');
  if (expandTools) {
    await page.getByRole('button', { name: 'Board tools', exact: true }).click();
    const header = page.locator('details.workspace-header-tools');
    if (await header.count() && await header.getAttribute('open') === null) await header.locator('summary').click();
    for (const summary of await page.locator('details.workspace-tool > summary').all()) {
      if (await summary.locator('xpath=..').getAttribute('open') === null) await summary.click();
    }
  }
}

export async function renameSelectedComponent(page, name) {
  const selected = page.locator('.workspace-component-node.selected');
  const editor = selected.getByRole('textbox', { name: 'Shared component name' });
  if (!(await editor.isVisible())) await selected.click();
  await editor.fill(name);
  await editor.press('Enter');
}
