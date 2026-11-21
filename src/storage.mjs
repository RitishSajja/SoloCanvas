export const BOARD_KEY = 'solocanvas.board.v1';
export const BACKUP_KEY = 'solocanvas.board.backup.v1';
export const WORKSPACE_KEY = 'solocanvas.workspace.v2';
export const WORKSPACE_BACKUP_KEY = 'solocanvas.workspace.backup.v2';
export const WORKSPACE_DAMAGED_KEY = 'solocanvas.workspace.damaged.v2';
export const WORKSPACE_LOCK = 'solocanvas.workspace.v2.write';
export const ONBOARDING_KEY = 'solocanvas.onboarding.v1';
const savedDataKeys = [BOARD_KEY, BACKUP_KEY, WORKSPACE_KEY, WORKSPACE_BACKUP_KEY, WORKSPACE_DAMAGED_KEY];
const blank = () => ({ nodes: [], edges: [] });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function getFirstRunStatus(storage) {
  try {
    const source = storage ?? globalThis.localStorage;
    if (source.getItem(ONBOARDING_KEY) !== null) return 'already-complete';
    return savedDataKeys.some(key => source.getItem(key) !== null) ? 'existing-data' : 'first-run';
  } catch {
    return 'unavailable';
  }
}

export function isFirstRun(storage) {
  return getFirstRunStatus(storage) === 'first-run';
}

export function completeOnboarding(storage) {
  const status = getFirstRunStatus(storage);
  if (status !== 'first-run') return status === 'already-complete' ? 'already-complete' : status;
  try {
    const target = storage ?? globalThis.localStorage;
    target.setItem(ONBOARDING_KEY, 'complete');
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

function validBoard(value) {
  return isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges) &&
    value.nodes.every(n => isRecord(n) && typeof n.id === 'string' && isRecord(n.position) &&
      Number.isFinite(n.position.x) && Number.isFinite(n.position.y) && isRecord(n.data)) &&
    value.edges.every(e => isRecord(e) && typeof e.id === 'string' &&
      typeof e.source === 'string' && typeof e.target === 'string');
}
export function parseBoard(raw) {
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
    const workspaceRaw = source.getItem(WORKSPACE_KEY);
    const firstRun = raw === null && workspaceRaw === null &&
      [BACKUP_KEY, WORKSPACE_BACKUP_KEY, WORKSPACE_DAMAGED_KEY, ONBOARDING_KEY].every(key => source.getItem(key) === null);
    // A newer-format workspace may contain edits that the v1 editor cannot see.
    if (workspaceRaw !== null) {
      return { board: (raw === null ? null : parseBoard(raw)) ?? blank(), raw, canSave: false, canRestoreBackup: false, firstRun, message: 'A newer workspace exists. This older board is read-only; export it if needed.' };
    }
    if (raw === null) return { board: blank(), raw: null, canSave: true, canRestoreBackup: false, firstRun, message: 'Not saved yet' };
    const board = parseBoard(raw);
    if (board) return { board, raw, canSave: true, canRestoreBackup: false, firstRun, message: 'Loaded saved board' };
    const backup = parseBoard(source.getItem(BACKUP_KEY) ?? '');
    if (backup) {
      return {
        board: backup,
        raw: null,
        canSave: false,
        canRestoreBackup: true,
        firstRun,
        message: 'The saved board is unreadable. A previous backup is available; restore it to replace the unreadable data.',
      };
    }
    throw new Error('Invalid board');
  } catch {
    return {
      board: blank(),
      raw: null,
      canSave: false,
      canRestoreBackup: false,
      firstRun: false,
      message: 'The saved board could not be read. Saving is disabled to protect existing data. Check browser storage or recover the saved data before reloading.',
    };
  }
}
export function saveBoard(board, storage, expectedRaw) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!validBoard(board)) return 'Could not save an invalid board.';
    if (target.getItem(WORKSPACE_KEY) !== null) return 'A newer workspace exists. This older board cannot be saved; export your changes.';
    const current = target.getItem(BOARD_KEY);
    if (expectedRaw !== undefined && current !== expectedRaw) {
      return 'The saved board changed in another tab. Your changes were not saved; copy them before reloading.';
    }
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
    if (target.getItem(WORKSPACE_KEY) !== null) return { success: false, message: 'A newer workspace exists. The older board cannot be restored here.' };
    const current = target.getItem(BOARD_KEY);
    if (current === null || parseBoard(current)) {
      return { success: false, message: 'The saved board is no longer unreadable. Reload before restoring.' };
    }
    const backup = target.getItem(BACKUP_KEY);
    const board = backup ? parseBoard(backup) : null;
    if (!board) {
      return { success: false, message: 'No valid saved backup is available.' };
    }
    target.setItem(BOARD_KEY, backup);
    return { success: true, board, raw: backup, message: 'Restored the previous backup on this device.' };
  } catch {
    return { success: false, message: 'Could not restore the backup. Check browser storage permissions.' };
  }
}

async function withBoardLock(action, locks) {
  // Legacy fallback remains available where Web Locks are absent; it is not atomic.
  if (!locks || typeof locks.request !== 'function') return action();
  return locks.request(WORKSPACE_LOCK, { mode: 'exclusive' }, action);
}
export async function saveBoardSafely(board, storage, expectedRaw, locks = globalThis.navigator?.locks) {
  try { return await withBoardLock(() => saveBoard(board, storage, expectedRaw), locks); }
  catch { return 'Could not obtain the board save lock. Export your changes.'; }
}
export async function restoreBackupSafely(storage, locks = globalThis.navigator?.locks) {
  try { return await withBoardLock(() => restoreBackup(storage), locks); }
  catch { return { success: false, message: 'Could not obtain the board restore lock.' }; }
}
