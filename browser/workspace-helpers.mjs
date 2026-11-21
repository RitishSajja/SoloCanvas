import { expect } from '@playwright/test';

export async function openWorkspaceBoard(page, { expandTools = true } = {}) {
  const legacyWorkspaceButton = page.getByRole('button', { name: 'Open workspace' });
  const boardButtons = page.getByRole('button', { name: /^Open board / });
  await expect(legacyWorkspaceButton.or(boardButtons.first())).toBeVisible();
  if (await legacyWorkspaceButton.isVisible()) await legacyWorkspaceButton.click();
  await expect(boardButtons.first()).toBeVisible();
  await boardButtons.first().click();
  if (expandTools) {
    const header = page.locator('details.workspace-header-tools');
    if (await header.count() && !(await header.getAttribute('open'))) await header.locator('summary').click();
    for (const summary of await page.locator('details.workspace-tool > summary').all()) {
      if (!(await summary.locator('xpath=..').getAttribute('open'))) await summary.click();
    }
  }
}
