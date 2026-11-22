// This module is a pure, in-memory model. It does not write browser storage.
import { parseBoard } from './storage.mjs';
import { validateMermaidImportDiagram } from './mermaid-import.mjs';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const idString = (v) => typeof v === 'string' && v.length > 0;
const unique = (items) => new Set(items).size === items.length;
const copy = (value) => structuredClone(value);
export const COMPONENT_SHAPES = ['rectangle', 'rounded', 'pill', 'diamond'];

function validateWorkspaceV2(workspace) {
  if (!object(workspace) || workspace.version !== 2 || !Array.isArray(workspace.cards) || !Array.isArray(workspace.boards) || workspace.boards.length === 0) return false;
  if (!workspace.cards.every(card => object(card) && idString(card.id) && object(card.data))) return false;
  if (!unique(workspace.cards.map(card => card.id))) return false;
  if (!workspace.boards.every(board => object(board) && idString(board.id) && typeof board.title === 'string' && object(board.extra) && Array.isArray(board.nodes) && Array.isArray(board.edges))) return false;
  if (!unique(workspace.boards.map(board => board.id))) return false;
  const cardIds = new Set(workspace.cards.map(card => card.id));
  for (const board of workspace.boards) {
    if (!board.nodes.every(node => object(node) && idString(node.id) && idString(node.cardId) && cardIds.has(node.cardId) &&
      object(node.position) && Number.isFinite(node.position.x) && Number.isFinite(node.position.y))) return false;
    if (!unique(board.nodes.map(node => node.id))) return false;
    const nodeIds = new Set(board.nodes.map(node => node.id));
    if (!board.edges.every(edge => object(edge) && idString(edge.id) && nodeIds.has(edge.source) && nodeIds.has(edge.target))) return false;
    if (!unique(board.edges.map(edge => edge.id))) return false;
  }
  const boardsById = new Map(workspace.boards.map(board => [board.id, board]));
  const parents = new Set();
  for (const board of workspace.boards) {
    const parent = board.parentPlacement ?? null;
    if (parent === null) continue;
    if (!object(parent) || !idString(parent.boardId) || !idString(parent.nodeId)) return false;
    const parentBoard = boardsById.get(parent.boardId);
    if (!parentBoard || !parentBoard.nodes.some(node => node.id === parent.nodeId)) return false;
    const key = JSON.stringify([parent.boardId, parent.nodeId]);
    if (parents.has(key)) return false;
    parents.add(key);
  }
  for (const board of workspace.boards) {
    const ancestors = new Set([board.id]);
    let current = board;
    while (current.parentPlacement) {
      current = boardsById.get(current.parentPlacement.boardId);
      if (ancestors.has(current.id)) return false;
      ancestors.add(current.id);
    }
  }
  return true;
}

export function migrateWorkspaceV2(workspace) {
  // v2 kept child boards when their parent placement was removed.
  if (workspace?.version === 2 && Array.isArray(workspace.boards)) {
    const placements = new Map(workspace.boards.map(board => [board?.id,
      new Set(Array.isArray(board?.nodes) ? board.nodes.map(node => node?.id) : [])]));
    workspace = { ...workspace, boards: workspace.boards.map(board => {
      const parent = board?.parentPlacement;
      if (idString(parent?.boardId) && idString(parent?.nodeId) &&
          !placements.get(parent.boardId)?.has(parent.nodeId)) {
        return { ...board, parentPlacement: null };
      }
      return board;
    }) };
  }
  if (!validateWorkspaceV2(workspace)) throw new Error('Invalid version 2 workspace');
  return {
    version: 3,
    cards: copy(workspace.cards),
    boards: workspace.boards.map(board => ({
      ...copy(board),
      parentPlacement: board.parentPlacement ?? null,
      notes: [],
      nodes: board.nodes.map(node => ({ ...copy(node), shape: 'pill' })),
    })),
  };
}

export const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const MAX_FILES = 128;

function attachmentTotals(workspace) {
  let count = 0;
  let bytes = 0;
  for (const owner of [workspace, ...workspace.boards, ...workspace.cards]) {
    if (owner.attachments === undefined) continue;
    if (!Array.isArray(owner.attachments)) return null;
    count += owner.attachments.length;
    if (count > MAX_FILES) return null;
    const ids = new Set();
    for (const file of owner.attachments) {
      if (!object(file) || !idString(file.id) || ids.has(file.id) ||
          !idString(file.name) || file.name.length > 255 ||
          !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES ||
          typeof file.base64 !== 'string' || file.base64.length !== 4 * Math.ceil(file.size / 3)) return null;
      ids.add(file.id);
      bytes += file.size;
      if (bytes > MAX_TOTAL_BYTES) return null;
      // Only the trailing group can contain padding.
      const padding = (3 - file.size % 3) % 3;
      const end = file.base64.length - padding;
      if (file.base64.slice(end) !== '='.repeat(padding) ||
          /[^A-Za-z0-9+/]/.test(file.base64.slice(0, end))) return null;
    }
  }
  return { count, bytes };
}

export function changeAttachment(workspace, scope, ownerId, change) {
  const next = copy(workspace);
  let owner;
  if (scope === 'workspace') owner = next;
  if (scope === 'board') owner = next.boards.find(board => board.id === ownerId);
  if (scope === 'component') owner = next.cards.find(card => card.id === ownerId);
  if (!owner) throw new Error('This item no longer exists.');
  const files = owner.attachments ?? [];
  owner.attachments = typeof change === 'string'
    ? files.filter(file => file.id !== change)
    : [...files, copy(change)];
  if (!attachmentTotals(next)) throw new Error('Use up to 128 files and 1 MiB total per workspace, with filenames up to 255 characters.');
  return next;
}

export function validateWorkspace(workspace) {
  if (!object(workspace) || workspace.version !== 3 || !Array.isArray(workspace.cards) || !Array.isArray(workspace.boards) || workspace.boards.length === 0) return false;
  if (!workspace.cards.every(card => object(card) && idString(card.id) && object(card.data))) return false;
  if (!unique(workspace.cards.map(card => card.id))) return false;
  if (!workspace.boards.every(board => object(board) && idString(board.id) && typeof board.title === 'string' &&
    object(board.extra) && Array.isArray(board.nodes) && Array.isArray(board.edges) &&
    Array.isArray(board.notes) && (board.parentPlacement === null || object(board.parentPlacement)))) return false;
  if (!unique(workspace.boards.map(board => board.id))) return false;
  const cardIds = new Set(workspace.cards.map(card => card.id));
  for (const board of workspace.boards) {
    if (!board.nodes.every(node => object(node) && idString(node.id) && idString(node.cardId) && cardIds.has(node.cardId) &&
      object(node.position) && Number.isFinite(node.position.x) && Number.isFinite(node.position.y) &&
      COMPONENT_SHAPES.includes(node.shape))) return false;
    if (!unique(board.nodes.map(node => node.id))) return false;
    const nodeIds = new Set(board.nodes.map(node => node.id));
    if (!board.edges.every(edge => object(edge) && idString(edge.id) && nodeIds.has(edge.source) && nodeIds.has(edge.target))) return false;
    if (!unique(board.edges.map(edge => edge.id))) return false;
    if (!board.notes.every(note => object(note) && idString(note.id) && typeof note.text === 'string' &&
      object(note.position) && Number.isFinite(note.position.x) && Number.isFinite(note.position.y))) return false;
    if (!unique(board.notes.map(note => note.id))) return false;
    if (!unique([...board.nodes.map(node => node.id), ...board.notes.map(note => note.id)])) return false;
  }
  if (!attachmentTotals(workspace)) return false;
  const boardsById = new Map(workspace.boards.map(board => [board.id, board]));
  const parents = new Set();
  for (const board of workspace.boards) {
    const parent = board.parentPlacement;
    if (parent === null) continue;
    if (!idString(parent.boardId) || !idString(parent.nodeId)) return false;
    const parentBoard = boardsById.get(parent.boardId);
    if (!parentBoard || !parentBoard.nodes.some(node => node.id === parent.nodeId)) return false;
    const key = JSON.stringify([parent.boardId, parent.nodeId]);
    if (parents.has(key)) return false;
    parents.add(key);
  }
  for (const board of workspace.boards) {
    const ancestors = new Set([board.id]);
    let current = board;
    while (current.parentPlacement) {
      current = boardsById.get(current.parentPlacement.boardId);
      if (ancestors.has(current.id)) return false;
      ancestors.add(current.id);
    }
  }
  return true;
}

export function migrateLegacyBoard(raw, { boardId = 'board-1', title = 'My board' } = {}) {
  const legacy = parseBoard(raw);
  if (!legacy || !idString(boardId) || typeof title !== 'string') throw new Error('Invalid legacy board');
  const { nodes, edges, ...extra } = legacy;
  // cardId is reserved by v2; refusing migration avoids overwriting legacy data.
  if (nodes.some(node => Object.hasOwn(node, 'cardId'))) throw new Error('Legacy node contains reserved cardId');
  const cards = nodes.map(node => ({ id: 'card:' + node.id, data: copy(node.data) }));
  const workspace = {
    version: 3,
    cards,
    boards: [{ id: boardId, title, extra: copy(extra), parentPlacement: null, notes: [], nodes: nodes.map(node => {
      const { data, ...instance } = node;
      return { ...copy(instance), cardId: 'card:' + node.id, shape: 'pill' };
    }), edges: copy(edges) }],
  };
  if (!validateWorkspace(workspace)) throw new Error('Legacy board has duplicate IDs or broken references');
  return workspace;
}

export function projectBoard(workspace, boardId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace');
  const board = workspace.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found');
  const cards = new Map(workspace.cards.map(card => [card.id, card]));
  return { ...copy(board.extra), nodes: board.nodes.map(node => {
    const { cardId, ...instance } = node;
    return { ...copy(instance), data: copy(cards.get(cardId).data) };
  }), edges: copy(board.edges) };
}

export function addBoard(workspace, id, title) {
  if (!validateWorkspace(workspace) || !idString(id) || typeof title !== 'string' || workspace.boards.some(board => board.id === id)) throw new Error('Invalid or duplicate board');
  const next = copy(workspace);
  next.boards.push({ id, title, extra: {}, parentPlacement: null, nodes: [], edges: [], notes: [] });
  return next;
}

export function addMiniBoard(workspace, boardId, nodeId, id, title) {
  if (!validateWorkspace(workspace) || !idString(id) || typeof title !== 'string' || !title.trim() || workspace.boards.some(board => board.id === id)) {
    throw new Error('Invalid or duplicate mini-board');
  }
  const parent = workspace.boards.find(board => board.id === boardId);
  if (!parent || !parent.nodes.some(node => node.id === nodeId)) throw new Error('Parent placement not found');
  if (workspace.boards.some(board => board.parentPlacement?.boardId === boardId && board.parentPlacement.nodeId === nodeId)) {
    throw new Error('This placement already has a mini-board');
  }
  const next = copy(workspace);
  next.boards.push({ id, title: title.trim(), extra: {}, parentPlacement: { boardId, nodeId }, nodes: [], edges: [], notes: [] });
  if (!validateWorkspace(next)) throw new Error('Invalid mini-board relationship');
  return next;
}

export function getMiniBoard(workspace, boardId, nodeId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace');
  return workspace.boards.find(board => board.parentPlacement?.boardId === boardId && board.parentPlacement.nodeId === nodeId) ?? null;
}

export function getBoardBreadcrumbs(workspace, boardId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace');
  const byId = new Map(workspace.boards.map(board => [board.id, board]));
  let board = byId.get(boardId);
  if (!board) throw new Error('Board not found');
  const crumbs = [];
  while (board) {
    if (!board.parentPlacement) crumbs.push({ boardId: board.id, title: board.title });
    else {
      const parent = board.parentPlacement;
      const parentBoard = byId.get(parent.boardId);
      const placement = parentBoard?.nodes.find(node => node.id === parent.nodeId);
      const card = workspace.cards.find(item => item.id === placement?.cardId);
      if (!parentBoard || !placement || !card) throw new Error('Invalid board ancestry');
      crumbs.push({ boardId: board.id, title: String(card.data.label ?? 'Untitled'), parentBoardId: parentBoard.id, parentNodeId: placement.id });
      board = parentBoard;
      continue;
    }
    break;
  }
  return crumbs.reverse();
}

export function updatePlacementShape(workspace, boardId, nodeId, shape) {
  if (!validateWorkspace(workspace) || !COMPONENT_SHAPES.includes(shape)) throw new Error('Invalid component shape');
  const next = copy(workspace);
  const placement = next.boards.find(board => board.id === boardId)?.nodes.find(node => node.id === nodeId);
  if (!placement) throw new Error('Placement not found');
  placement.shape = shape;
  return next;
}

export function createMermaidBoard(workspace, title, diagram, idFactory = () => crypto.randomUUID()) {
  if (!validateWorkspace(workspace) || typeof title !== 'string' || !title.trim() ||
      !validateMermaidImportDiagram(diagram) || typeof idFactory !== 'function') {
    throw new Error('Invalid Mermaid board import');
  }
  const next = copy(workspace);
  const existingIds = new Set([
    ...next.cards.map(card => card.id),
    ...next.boards.flatMap(board => [
      board.id,
      ...board.nodes.map(node => node.id),
      ...board.edges.map(edge => edge.id),
    ]),
  ]);
  const allocateId = () => {
    const id = idFactory();
    if (!idString(id) || existingIds.has(id)) throw new Error('Could not generate unique IDs for the imported board');
    existingIds.add(id);
    return id;
  };
  const boardId = allocateId();
  const importedNodes = new Map();
  const nodes = diagram.nodes.map((item, index) => {
    const cardId = allocateId();
    const nodeId = allocateId();
    importedNodes.set(item.id, nodeId);
    next.cards.push({ id: cardId, data: { label: item.label } });
    return { id: nodeId, cardId, position: { x: 60 + (index % 4) * 240, y: 60 + Math.floor(index / 4) * 140 } };
  });
  const edges = diagram.edges.map(item => ({
    id: allocateId(),
    source: importedNodes.get(item.source),
    target: importedNodes.get(item.target),
    label: item.label,
  }));
  next.boards.push({ id: boardId, title: title.trim(), extra: {}, parentPlacement: null, nodes: nodes.map(node => ({ ...node, shape: 'pill' })), edges, notes: [] });
  if (!validateWorkspace(next)) throw new Error('Imported Mermaid board failed workspace validation');
  return { workspace: next, boardId };
}

export function placeCard(workspace, boardId, cardId, node) {
  if (!validateWorkspace(workspace) || !workspace.cards.some(card => card.id === cardId) || !object(node) || Object.hasOwn(node, 'data') || Object.hasOwn(node, 'cardId')) throw new Error('Invalid card placement');
  const next = copy(workspace);
  const board = next.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found');
  board.nodes.push({ ...copy(node), shape: COMPONENT_SHAPES.includes(node.shape) ? node.shape : 'pill', cardId });
  if (!validateWorkspace(next)) throw new Error('Invalid or duplicate node');
  return next;
}

export function updateCard(workspace, cardId, data) {
  if (!validateWorkspace(workspace) || !object(data)) throw new Error('Invalid card update');
  const next = copy(workspace);
  const card = next.cards.find(item => item.id === cardId);
  if (!card) throw new Error('Card not found');
  card.data = copy(data);
  return next;
}

export function renameBoard(workspace, boardId, title) {
  if (!validateWorkspace(workspace) || typeof title !== 'string' || !title.trim()) throw new Error('Invalid board name');
  const next = copy(workspace);
  const board = next.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found');
  board.title = title.trim();
  return next;
}

export function removeBoard(workspace, boardId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace');
  if (!workspace.boards.some(board => board.id === boardId)) throw new Error('Board not found');
  if (workspace.boards.length <= 1) throw new Error('Cannot remove the last board');
  if (workspace.boards.some(board => board.parentPlacement?.boardId === boardId)) throw new Error('Remove nested boards first');
  const next = copy(workspace);
  next.boards = next.boards.filter(board => board.id !== boardId);
  return next;
}

export function removeBoardTree(workspace, boardId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace');
  if (!workspace.boards.some(board => board.id === boardId)) throw new Error('Board not found');
  const removed = new Set([boardId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const board of workspace.boards) {
      if (!removed.has(board.id) && board.parentPlacement && removed.has(board.parentPlacement.boardId)) {
        removed.add(board.id); changed = true;
      }
    }
  }
  if (removed.size === workspace.boards.length) throw new Error('Cannot remove the last board');
  const next = copy(workspace);
  next.boards = next.boards.filter(board => !removed.has(board.id));
  return next;
}

export function addNote(workspace, boardId, note) {
  if (!validateWorkspace(workspace) || !object(note) || !idString(note.id) || typeof note.text !== 'string' ||
      !object(note.position) || !Number.isFinite(note.position.x) || !Number.isFinite(note.position.y)) throw new Error('Invalid sticky note');
  const next = copy(workspace);
  const board = next.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found');
  board.notes.push(copy(note));
  if (!validateWorkspace(next)) throw new Error('Invalid or duplicate sticky note');
  return next;
}

export function updateNote(workspace, boardId, noteId, text) {
  if (!validateWorkspace(workspace) || typeof text !== 'string') throw new Error('Invalid sticky note');
  const next = copy(workspace);
  const note = next.boards.find(board => board.id === boardId)?.notes.find(item => item.id === noteId);
  if (!note) throw new Error('Sticky note not found');
  note.text = text;
  return next;
}

export function removeNote(workspace, boardId, noteId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace');
  const next = copy(workspace);
  const board = next.boards.find(item => item.id === boardId);
  if (!board || !board.notes.some(note => note.id === noteId)) throw new Error('Sticky note not found');
  board.notes = board.notes.filter(note => note.id !== noteId);
  return next;
}

export function removePlacementTree(workspace, boardId, nodeId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace');
  const board = workspace.boards.find(item => item.id === boardId);
  if (!board || !board.nodes.some(node => node.id === nodeId)) throw new Error('Placement not found');
  const removedBoards = new Set(workspace.boards
    .filter(item => item.parentPlacement?.boardId === boardId && item.parentPlacement.nodeId === nodeId)
    .map(item => item.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const child of workspace.boards) {
      if (!removedBoards.has(child.id) && child.parentPlacement && removedBoards.has(child.parentPlacement.boardId)) {
        removedBoards.add(child.id); changed = true;
      }
    }
  }
  const next = copy(workspace);
  next.boards = next.boards.filter(item => !removedBoards.has(item.id));
  const target = next.boards.find(item => item.id === boardId);
  target.nodes = target.nodes.filter(node => node.id !== nodeId);
  target.edges = target.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId);
  if (!validateWorkspace(next)) throw new Error('Removing the placement would invalidate the workspace');
  return next;
}
function placementsOf(workspace, cardId) {
  return workspace.boards.flatMap(board => board.nodes
    .filter(node => node.cardId === cardId)
    .map(node => ({ boardId: board.id, boardTitle: board.title, nodeId: node.id })));
}

/** List all appearances of a shared component, even multiple times on one board. */
export function findCardPlacements(workspace, cardId) {
  if (!validateWorkspace(workspace) || !workspace.cards.some(card => card.id === cardId)) throw new Error('Invalid component');
  return placementsOf(workspace, cardId);
}

/** Search component names and, only on request, imported source text. */
export function findCards(workspace, query, { includeSource = false } = {}) {
  if (!validateWorkspace(workspace) || typeof query !== 'string') throw new Error('Invalid search');
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return workspace.cards.flatMap(card => {
    const label = String(card.data.label ?? 'Untitled');
    const source = typeof card.data.sourceText === 'string' ? card.data.sourceText : '';
    if (!label.toLocaleLowerCase().includes(needle) && !(includeSource && source.toLocaleLowerCase().includes(needle))) return [];
    const placements = placementsOf(workspace, card.id);
    return [{ cardId: card.id, label, placements }];
  });
}
