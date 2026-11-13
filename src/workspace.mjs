// This module is a pure, in-memory model. It does not write browser storage.
// Keep v1 data untouched until a future persistence migration is designed and tested.
import { parseBoard } from './storage.mjs';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const idString = (v) => typeof v === 'string' && v.length > 0;
const unique = (items) => new Set(items).size === items.length;
const copy = (value) => structuredClone(value);

export function validateWorkspace(workspace) {
  if (!object(workspace) || workspace.version !== 2 || !Array.isArray(workspace.cards) || !Array.isArray(workspace.boards)) return false;
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
  return true;
}

export function migrateLegacyBoard(raw, { boardId = 'board-1', title = 'My board' } = {}) {
  const legacy = parseBoard(raw);
  if (!legacy || !idString(boardId) || typeof title !== 'string') throw new Error('Invalid legacy board');
  const { nodes, edges, ...extra } = legacy;
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
