import { defineConfig } from '@playwright/test';

// Exercise import analysis and Mermaid export against the built production bundle.
export default defineConfig({
  testDir: './browser',
  testMatch: ['**/dependency-map.e2e.mjs', '**/mermaid-export.e2e.mjs'],
  use: { baseURL: 'http://127.0.0.1:4174', browserName: 'chromium' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4174', url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI },
});
