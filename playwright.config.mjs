import { defineConfig } from '@playwright/test';
import { DEV_PORT } from './playwright-ports.mjs';

const baseURL = `http://127.0.0.1:${DEV_PORT}`;

export default defineConfig({
  testDir: './browser',
  testMatch: '**/*.e2e.mjs',
  use: { baseURL, browserName: 'chromium' },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${DEV_PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
