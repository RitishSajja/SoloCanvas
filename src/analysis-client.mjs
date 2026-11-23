import { validateWorkspace } from './workspace.mjs';

// Avoid sending unrelated boards or unplaced cards to the analyzer.
export function boardAnalysisSnapshot(workspace, boardId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace.');
  const board = workspace.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found.');
  // Missing is a placement flag. A shared file can still have a live placement.
  const nodes = board.nodes.filter(node => node.fileMissing !== true);
  const nodeIds = new Set(nodes.map(node => node.id));
  const cardIds = new Set(nodes.map(node => node.cardId));
  const cards = workspace.cards.filter(card => cardIds.has(card.id)).map(card => {
    const data = card.data;
    return { id: card.id, data: data.kind === 'file' && typeof data.path === 'string'
      ? { kind: 'file', path: data.path, ...(typeof data.sourceText === 'string' ? { sourceText: data.sourceText } : {}) }
      : {} };
  });
  return {
    version: 3,
    cards,
    boards: [{ id: board.id, title: board.title, extra: {}, parentPlacement: null, notes: [],
      nodes: nodes.map(node => ({ id: node.id, cardId: node.cardId, shape: node.shape, position: { ...node.position } })),
      edges: board.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
        .map(edge => ({ id: edge.id, source: edge.source, target: edge.target })),
    }],
  };
}

export function startDependencyAnalysis(workspace, boardId) {
  const snapshot = boardAnalysisSnapshot(workspace, boardId);
  let worker;
  try {
    worker = new Worker(new URL('./dependency-worker.mjs', import.meta.url), { type: 'module' });
  } catch {
    throw new Error('Import analysis requires a working browser worker.');
  }
  let settled = false;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    rejectPromise = reject;
    const finish = () => { if (settled) return false; settled = true; worker.terminate(); return true; };
    worker.onmessage = event => {
      if (!finish()) return;
      if (event.data?.ok) resolve(event.data.result);
      else reject(new Error(event.data?.error || 'Could not analyze imports.'));
    };
    worker.onerror = () => { if (finish()) reject(new Error('Import analysis worker failed.')); };
    worker.onmessageerror = () => { if (finish()) reject(new Error('Import analysis worker returned invalid data.')); };
    try { worker.postMessage({ workspace: snapshot, boardId }); }
    catch { if (finish()) reject(new Error('Could not send data to the analysis worker.')); }
  });
  return {
    promise,
    cancel() {
      if (settled) return;
      settled = true; worker.terminate();
      const error = new Error('Import analysis cancelled.'); error.name = 'AbortError'; rejectPromise(error);
    },
  };
}
