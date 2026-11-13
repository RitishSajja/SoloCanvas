export const BOARD_KEY = 'solocanvas.board.v1';
export const BACKUP_KEY = 'solocanvas.board.backup.v1';
const blank = () => ({ nodes: [], edges: [] });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function validBoard(value) {
  return isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges) &&
    value.nodes.every(n => isRecord(n) && typeof n.id === 'string' && isRecord(n.position) &&
      Number.isFinite(n.position.x) && Number.isFinite(n.position.y) && isRecord(n.data)) &&
    value.edges.every(e => isRecord(e) && typeof e.id === 'string' &&
      typeof e.source === 'string' && typeof e.target === 'string');
}
function parseBoard(raw) {
  try {
    const board = JSON.parse(raw);
    return validBoard(board) ? board : null;
  } catch {
    return null;
  }
}
export function loadBoard(storage) {
  try {
    const source = storage ?? globalThis.localStorage;
    const raw = source.getItem(BOARD_KEY);
    if (raw === null) return { board: blank(), canSave: true, canRestoreBackup: false, message: 'Not saved yet' };
    const board = parseBoard(raw);
    if (board) return { board, canSave: true, canRestoreBackup: false, message: 'Loaded saved board' };
    const backup = parseBoard(source.getItem(BACKUP_KEY) ?? '');
    if (backup) {
      return {
        board: backup,
        canSave: false,
        canRestoreBackup: true,
        message: 'The saved board is unreadable. A previous backup is available; restore it to replace the unreadable data.',
      };
    }
    throw new Error('Invalid board');
  } catch {
    return {
      board: blank(),
      canSave: false,
      canRestoreBackup: false,
      message: 'The saved board could not be read. Saving is disabled to protect existing data. Check browser storage or recover the saved data before reloading.',
    };
  }
}
export function saveBoard(board, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!validBoard(board)) return 'Could not save an invalid board.';
    const current = target.getItem(BOARD_KEY);
    if (current !== null && !parseBoard(current)) {
      return 'Could not save because the saved board is unreadable. Restore a backup first.';
    }
    if (current !== null) target.setItem(BACKUP_KEY, current);
    target.setItem(BOARD_KEY, JSON.stringify(board));
    return 'Saved on this device';
  } catch {
    return 'Could not save. Check browser storage permissions.';
  }
}
export function restoreBackup(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const current = target.getItem(BOARD_KEY);
    if (current === null || parseBoard(current)) {
      return { success: false, message: 'The saved board is no longer unreadable. Reload before restoring.' };
    }
    const backup = target.getItem(BACKUP_KEY);
    if (!backup || !parseBoard(backup)) {
      return { success: false, message: 'No valid saved backup is available.' };
    }
    target.setItem(BOARD_KEY, backup);
    return { success: true, message: 'Restored the previous backup on this device.' };
  } catch {
    return { success: false, message: 'Could not restore the backup. Check browser storage permissions.' };
  }
}
