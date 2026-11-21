// This module is a pure, in-memory model. It does not write browser storage.
// Keep v1 data untouched until a future persistence migration is designed and tested.
import { parseBoard } from './storage.mjs';
import { validateMermaidImportDiagram } from './mermaid-import.mjs';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const idString = (v) => typeof v === 'string' && v.length > 0;
const unique = (items) => new Set(items).size === items.length;
const copy = (value) => structuredClone(value);

export function validateWorkspace(workspace) {
  if (!object(workspace) || workspace.version !== 2 || !Array.isArray(workspace.cards) || !Array.isArray(workspace.boards)) return false;
  if (!workspace.cards.every(card => object(card) && idString(card.id) && object(card.data))) return false;
  if (!unique(workspace.cards.map(card => card.id))) return false;
  if (!workspace.boards.every(board => object(board) && idString(board.id) && typeof board.title === 'string' &&
      (board.group === undefined || typeof board.group === 'string') &&
      object(board.extra) && Array.isArray(board.nodes) && Array.isArray(board.edges))) return false;
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
    version: 2,
    cards,
    boards: [{ id: boardId, title, extra: copy(extra), nodes: nodes.map(node => {
      const { data, ...instance } = node;
      return { ...copy(instance), cardId: 'card:' + node.id };
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
  next.boards.push({ id, title, extra: {}, nodes: [], edges: [] });
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
  next.boards.push({ id: boardId, title: title.trim(), extra: {}, nodes, edges });
  if (!validateWorkspace(next)) throw new Error('Imported Mermaid board failed workspace validation');
  return { workspace: next, boardId };
}

export function placeCard(workspace, boardId, cardId, node) {
  if (!validateWorkspace(workspace) || !workspace.cards.some(card => card.id === cardId) || !object(node) || Object.hasOwn(node, 'data') || Object.hasOwn(node, 'cardId')) throw new Error('Invalid card placement');
  const next = copy(workspace);
  const board = next.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found');
  board.nodes.push({ ...copy(node), cardId });
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

export function setBoardGroup(workspace, boardId, group) {
  if (!validateWorkspace(workspace) || typeof group !== 'string') throw new Error('Invalid board project area');
  const next = copy(workspace);
  const board = next.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found');
  const normalized = group.trim();
  if (normalized) board.group = normalized;
  else delete board.group;
  return next;
}

export function removeBoard(workspace, boardId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace');
  if (!workspace.boards.some(board => board.id === boardId)) throw new Error('Board not found');
  if (workspace.boards.length <= 1) throw new Error('Cannot remove the last board');
  const next = copy(workspace);
  next.boards = next.boards.filter(board => board.id !== boardId);
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
