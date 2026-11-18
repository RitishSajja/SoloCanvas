// Build a local map from names explicitly selected by the user; file contents are never read.
import { addBoard, validateWorkspace } from './workspace.mjs';

export const MAX_MAP_FILES = 100;

export function validateFilePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_MAP_FILES) {
    throw new Error('Choose between 1 and 100 files.');
  }
  const valid = paths.every(path => typeof path === 'string' && path.length > 0 && path.length <= 512 &&
    !/[\\\\\x00-\x1f\x7f]/.test(path) && !path.startsWith('/') &&
    path.split('/').every(part => part !== '' && part !== '.' && part !== '..'));
  if (!valid) throw new Error('A selected file has an invalid or overly long path.');
  if (new Set(paths).size !== paths.length) throw new Error('Selected file paths must be unique. Choose a folder to retain paths.');
  return [...paths].sort((a, b) => a.localeCompare(b));
}

export function createFileMap(workspace, boardId, title, paths, makeId) {
  const names = validateFilePaths(paths);
  if (typeof title !== 'string' || !title.trim() || typeof makeId !== 'function') throw new Error('Invalid map details.');
  const next = addBoard(workspace, boardId, title.trim());
  const board = next.boards.find(item => item.id === boardId);
  names.forEach((path, index) => {
    const cardId = makeId();
    const nodeId = makeId();
    next.cards.push({ id: cardId, data: { label: path, kind: 'file', path } });
    board.nodes.push({ id: nodeId, cardId, position: { x: (index % 4) * 260, y: Math.floor(index / 4) * 100 } });
  });
  if (!validateWorkspace(next)) throw new Error('Could not create unique file map IDs.');
  return next;
}
