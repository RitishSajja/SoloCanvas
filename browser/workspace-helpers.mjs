export async function openWorkspaceBoard(page, { expandTools = true } = {}) {
  if (await page.getByRole('button', { name: 'Open workspace' }).count()) {
    await page.getByRole('button', { name: 'Open workspace' }).click();
  }
  if (await page.getByRole('button', { name: /^Open board / }).count()) {
    await page.getByRole('button', { name: /^Open board / }).first().click();
  }
  if (expandTools) {
    const header = page.locator('details.workspace-header-tools');
    if (await header.count() && !(await header.getAttribute('open'))) await header.locator('summary').click();
    for (const summary of await page.locator('details.workspace-tool > summary').all()) {
      if (!(await summary.locator('xpath=..').getAttribute('open'))) await summary.click();
    }
  }
}
