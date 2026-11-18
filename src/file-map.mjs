// Build a local map from explicitly selected paths and, only when requested, bounded source text.
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

export function createFileMap(workspace, boardId, title, paths, makeId, contents = new Map()) {
  const names = validateFilePaths(paths);
  if (typeof title !== 'string' || !title.trim() || typeof makeId !== 'function') throw new Error('Invalid map details.');
  if (!(contents instanceof Map) || [...contents].some(([path, text]) => !names.includes(path) || typeof text !== 'string')) throw new Error('Invalid source contents.');
  const next = addBoard(workspace, boardId, title.trim());
  const board = next.boards.find(item => item.id === boardId);
  names.forEach((path, index) => {
    const cardId = makeId();
    const nodeId = makeId();
    next.cards.push({ id: cardId, data: { label: path, kind: 'file', path, ...(contents.has(path) ? { sourceText: contents.get(path) } : {}) } });
    board.nodes.push({ id: nodeId, cardId, position: { x: (index % 4) * 260, y: Math.floor(index / 4) * 100 } });
  });
  if (!validateWorkspace(next)) throw new Error('Could not create unique file map IDs.');
  return next;
}

export const MAX_SOURCE_FILE_BYTES = 64 * 1024;
export const MAX_SOURCE_TOTAL_BYTES = 512 * 1024;
const sourceExtension = /\.(?:js|jsx|mjs|cjs|ts|tsx|py)$/i;

// Call only after the user opts in. Unsupported, too-large and invalid files are
// reported, not executed, parsed as markup, or read from paths on the host.
export async function readSelectedSources(entries) {
  validateFilePaths(entries.map(entry => entry.path));
  const contents = new Map();
  const skipped = [];
  let total = 0;
  for (const { path, file } of entries) {
    if (!sourceExtension.test(path)) { skipped.push({ path, reason: 'unsupported extension' }); continue; }
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_SOURCE_FILE_BYTES) {
      skipped.push({ path, reason: 'file exceeds 64 KiB' }); continue;
    }
    if (total + file.size > MAX_SOURCE_TOTAL_BYTES) { skipped.push({ path, reason: 'total exceeds 512 KiB' }); continue; }
    try {
      const data = await file.arrayBuffer();
      if (data.byteLength !== file.size || data.byteLength > MAX_SOURCE_FILE_BYTES) throw new Error('size changed');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
      if (text.includes('\0')) throw new Error('binary data');
      contents.set(path, text);
      total += data.byteLength;
    } catch {
      skipped.push({ path, reason: 'unreadable or invalid UTF-8 text' });
    }
  }
  return { contents, skipped };
}
