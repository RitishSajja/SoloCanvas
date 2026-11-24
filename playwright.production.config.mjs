import { defineConfig } from '@playwright/test';
import { PREVIEW_PORT } from './playwright-ports.mjs';

const baseURL = `http://127.0.0.1:${PREVIEW_PORT}`;

// Exercise import analysis, file exports and clipboard interactions in the built app.
export default defineConfig({
  testDir: './browser',
  testMatch: ['**/dependency-map.e2e.mjs', '**/mermaid-export.e2e.mjs', '**/spatial-context.e2e.mjs', '**/architecture-question.e2e.mjs'],
  use: { baseURL, browserName: 'chromium' },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${PREVIEW_PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
