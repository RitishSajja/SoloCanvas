export const BOARD_KEY = 'solocanvas.board.v1';
const blank = () => ({ nodes: [], edges: [] });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function validBoard(value) {
  return isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges) &&
    value.nodes.every(n => isRecord(n) && typeof n.id === 'string' && isRecord(n.position) &&
      Number.isFinite(n.position.x) && Number.isFinite(n.position.y) && isRecord(n.data)) &&
    value.edges.every(e => isRecord(e) && typeof e.id === 'string' &&
      typeof e.source === 'string' && typeof e.target === 'string');
}
export function loadBoard(storage) {
  try {
    const source = storage ?? globalThis.localStorage;
    const raw = source.getItem(BOARD_KEY);
    if (raw === null) return { board: blank(), canSave: true, message: 'Not saved yet' };
    const board = JSON.parse(raw);
    if (!validBoard(board)) throw new Error('Invalid board');
    return { board, canSave: true, message: 'Loaded saved board' };
  } catch {
    return { board: blank(), canSave: false, message: 'The saved board could not be read. Saving is disabled to protect existing data. Check browser storage or recover the saved data before reloading.' };
  }
}
export function saveBoard(board, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    target.setItem(BOARD_KEY, JSON.stringify(board));
    return 'Saved on this device';
  } catch {
    return 'Could not save. Check browser storage permissions.';
  }
}
