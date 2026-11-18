import { validateWorkspace } from './workspace.mjs';

export function addSuggestedDependencies(workspace, boardId, suggestions, makeId) {
  if (!validateWorkspace(workspace) || !Array.isArray(suggestions) || typeof makeId !== 'function') throw new Error('Invalid suggestions.');
  const next = structuredClone(workspace);
  const board = next.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found.');
  const nodes = new Set(board.nodes.map(node => node.id));
  const pairs = new Set(board.edges.map(edge => JSON.stringify([edge.source, edge.target])));
  for (const item of suggestions) {
    if (!nodes.has(item.sourceNodeId) || !nodes.has(item.targetNodeId) || typeof item.sourcePath !== 'string' ||
        typeof item.targetPath !== 'string' || typeof item.specifier !== 'string' || !Number.isInteger(item.line) || item.line < 1) {
      throw new Error('Invalid or stale suggestion.');
    }
    const pair = JSON.stringify([item.sourceNodeId, item.targetNodeId]);
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    board.edges.push({ id: makeId(), source: item.sourceNodeId, target: item.targetNodeId, label: 'imports',
      data: { sourcePath: item.sourcePath, targetPath: item.targetPath, specifier: item.specifier, line: item.line } });
  }
  if (!validateWorkspace(next)) throw new Error('Could not create unique relationships.');
  return next;
}
