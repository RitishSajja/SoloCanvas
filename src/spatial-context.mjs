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

export function isContextRegion(region) {
  return region != null && Number.isFinite(region.x) && Number.isFinite(region.y) &&
    positive(region.width) && positive(region.height) &&
    Number.isFinite(region.x + region.width) && Number.isFinite(region.y + region.height) &&
    region.x + region.width > region.x && region.y + region.height > region.y;
}

// Sticky nodes have a fixed size on the canvas. Components are measured after rendering.
export const STICKY_NOTE_SIZE = Object.freeze({ width: 184, height: 148 });

function intersects(region, position, width, height) {
  return position.x < region.x + region.width && position.x + width > region.x &&
    position.y < region.y + region.height && position.y + height > region.y;
}

function placementSize(node) {
  const width = positive(node.measured?.width) ? node.measured.width : node.width;
  const height = positive(node.measured?.height) ? node.measured.height : node.height;
  return { width, height };
}

function placementInRegion(node, region) {
  const size = placementSize(node);
  // Before React Flow measures a card, use its minimum rendered size from component-summary.css.
  const minWidth = node.shape === 'diamond' ? 230 : 204;
  const width = positive(size.width) ? size.width : minWidth;
  const height = positive(size.height) ? size.height : 92;
  // Imported React Flow nodes may anchor their position at the center or another origin.
  const [originX, originY] = Array.isArray(node.origin) ? node.origin : [];
  const topLeft = {
    x: node.position.x - (Number.isFinite(originX) ? originX * width : 0),
    y: node.position.y - (Number.isFinite(originY) ? originY * height : 0),
  };
  return intersects(region, topLeft, width, height);
}

function placementContext(node, miniBoardId) {
  const placement = { id: node.id, componentId: node.cardId, position: position(node.position), shape: node.shape };
  const { width, height } = placementSize(node);
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

export function buildBoardContext(workspace, boardId, { includeNoteText = false, region } = {}) {
  // Storage/import validate and normalize the workspace. Revalidating here would
  // scan attachment bytes on every canvas edit while the preview is open.
  const board = workspace.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found.');
  let { nodes, notes, edges } = board;
  let scope = { kind: 'board' };
  if (region !== undefined) {
    if (!isContextRegion(region)) throw new Error('Enter a valid rectangular region.');
    const { x, y, width, height } = region;
    scope = { kind: 'region', x, y, width, height };
    // Legacy diagrams can retain hidden React Flow elements that cannot be picked on the canvas.
    nodes = nodes.filter(node => node.hidden !== true && placementInRegion(node, region));
    const included = new Set(nodes.map(node => node.id));
    edges = edges.filter(edge => edge.hidden !== true && included.has(edge.source) && included.has(edge.target));
    notes = notes.filter(note => intersects(region, note.position, STICKY_NOTE_SIZE.width, STICKY_NOTE_SIZE.height));
  }
  const componentIds = new Set(nodes.map(node => node.cardId));
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
    scope,
    board: {
      id: board.id,
      title: board.title,
      parentPlacement: parent ? { boardId: parent.boardId, placementId: parent.nodeId } : null,
    },
    components: components.sort(byId),
    placements: nodes.map(node => placementContext(node, miniBoards.get(node.id))).sort(byId),
    relationships: edges.map(relationshipContext).sort(byId),
    notes: notes.map(note => {
      const entry = { id: note.id, position: position(note.position) };
      if (includeNoteText === true) entry.text = note.text;
      return entry;
    }).sort(byId),
  };
}
