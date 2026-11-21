import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      if (localStorage.getItem('solocanvas.onboarding.v1') === null) {
        localStorage.setItem('solocanvas.onboarding.v1', 'complete');
      }
    });
    await use(context);
  },
});

export { expect };
