import { isInferredDependency } from './refresh-dependencies.mjs';

// Use code-unit order so identical workspace content has the same JSON in every locale.
function byId(a, b) {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function position({ x, y }) {
  return { x, y };
}

function label(value, fallback) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function positive(value) {
  return Number.isFinite(value) && value > 0;
}

function placementContext(node, miniBoardId) {
  const placement = { id: node.id, componentId: node.cardId, position: position(node.position), shape: node.shape };
  const width = positive(node.measured?.width) ? node.measured.width : node.width;
  const height = positive(node.measured?.height) ? node.measured.height : node.height;
  if (positive(width) && positive(height)) placement.size = { width, height };
  if (miniBoardId !== undefined) placement.miniBoardId = miniBoardId;
  if (node.fileMissing === true) placement.fileMissing = true;
  return placement;
}

function relationshipContext(edge) {
  const inferred = isInferredDependency(edge);
  const relationship = {
    id: edge.id,
    sourcePlacementId: edge.source,
    targetPlacementId: edge.target,
    label: label(edge.label, ''),
    kind: inferred ? 'inferred' : 'manual',
  };
  if (inferred) {
    const { sourcePath, targetPath, specifier, line, importKind = 'static' } = edge.data;
    relationship.evidence = { sourcePath, targetPath, specifier, line, importKind };
  }
  return relationship;
}

export function buildBoardContext(workspace, boardId, { includeNoteText = false } = {}) {
  // Storage/import validate and normalize the workspace. Revalidating here would
  // scan attachment bytes on every canvas edit while the preview is open.
  const board = workspace.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found.');
  const componentIds = new Set(board.nodes.map(node => node.cardId));
  const components = workspace.cards.filter(card => componentIds.has(card.id)).map(({ id, data }) => {
    const kind = data.kind === 'file' ? 'file' : 'component';
    const component = { id, label: label(data.label, 'Untitled component'), kind };
    if (kind === 'file' && typeof data.path === 'string') component.path = data.path;
    return component;
  });
  const miniBoards = new Map();
  for (const item of workspace.boards) {
    if (item.parentPlacement?.boardId === boardId) miniBoards.set(item.parentPlacement.nodeId, item.id);
  }
  const parent = board.parentPlacement;
  return {
    format: 'solocanvas.board-context',
    version: 1,
    scope: { kind: 'board' },
    board: {
      id: board.id,
      title: board.title,
      parentPlacement: parent ? { boardId: parent.boardId, placementId: parent.nodeId } : null,
    },
    components: components.sort(byId),
    placements: board.nodes.map(node => placementContext(node, miniBoards.get(node.id))).sort(byId),
    relationships: board.edges.map(relationshipContext).sort(byId),
    notes: board.notes.map(note => {
      const entry = { id: note.id, position: position(note.position) };
      if (includeNoteText === true) entry.text = note.text;
      return entry;
    }).sort(byId),
  };
}
