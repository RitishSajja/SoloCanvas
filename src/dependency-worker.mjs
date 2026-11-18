import { suggestDependencies } from './dependency-map.mjs';

// The worker receives only the requested board and referenced card data.
self.onmessage = event => {
  try {
    const { workspace, boardId } = event.data;
    self.postMessage({ ok: true, result: suggestDependencies(workspace, boardId) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Could not analyze imports.' });
  }
};
