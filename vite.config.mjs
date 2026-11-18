import { defineConfig } from 'vite';

// The worker imports TypeScript lazily; discover it before the dev server
// starts so Vite does not reload open editors when analysis first runs.
export default defineConfig({ optimizeDeps: { include: ['typescript'] } });
