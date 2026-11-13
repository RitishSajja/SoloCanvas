// Isolated v2 persistence adapter. The current application still uses v1.
// A read never modifies data. A write never removes or rewrites the v1 board.
import { BOARD_KEY } from './storage.mjs';
import { migrateLegacyBoard, validateWorkspace } from './workspace.mjs';

export const WORKSPACE_KEY = 'solocanvas.workspace.v2';
export const WORKSPACE_BACKUP_KEY = 'solocanvas.workspace.backup.v2';

// Reject values JSON would silently drop or change, including cycles and non-finite numbers.
function jsonSafe(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  const array = Array.isArray(value);
  const proto = Object.getPrototypeOf(value);
  if (!array && proto !== Object.prototype && proto !== null) return false;
  ancestors.add(value);
  let ok;
  if (array) {
    ok = Object.keys(value).length === value.length && value.every(item => jsonSafe(item, ancestors));
  } else {
    ok = Object.keys(value).every(key => jsonSafe(value[key], ancestors));
  }
  ancestors.delete(value);
  return ok;
}

export function parseWorkspace(raw) {
  try {
    const parsed = JSON.parse(raw);
    return validateWorkspace(parsed) && jsonSafe(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function openWorkspace(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const workspaceRaw = target.getItem(WORKSPACE_KEY);
    const legacyRaw = target.getItem(BOARD_KEY);
    const snapshot = { workspaceRaw, legacyRaw };
    if (workspaceRaw !== null) {
      const workspace = parseWorkspace(workspaceRaw);
      if (!workspace) return { ok: false, error: 'The saved workspace is unreadable or uses an unsupported version. No data was changed.' };
      return { ok: true, workspace, snapshot, source: 'workspace' };
    }
    if (legacyRaw !== null) {
      try {
        const workspace = migrateLegacyBoard(legacyRaw);
        return { ok: true, workspace, snapshot, source: 'legacy' };
      } catch {
        return { ok: false, error: 'The previous board cannot be migrated safely. No data was changed.' };
      }
    }
    return {
      ok: true,
      workspace: { version: 2, cards: [], boards: [{ id: 'board-1', title: 'My board', extra: {}, nodes: [], edges: [] }] },
      snapshot,
      source: 'empty',
    };
  } catch {
    return { ok: false, error: 'Browser storage could not be read. No data was changed.' };
  }
}

export function writeWorkspace(workspace, snapshot, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!snapshot || !('workspaceRaw' in snapshot) || !('legacyRaw' in snapshot) ||
        !(snapshot.workspaceRaw === null || typeof snapshot.workspaceRaw === 'string') ||
        !(snapshot.legacyRaw === null || typeof snapshot.legacyRaw === 'string')) {
      return { ok: false, error: 'Missing storage snapshot. Reload before saving.' };
    }
    if (!validateWorkspace(workspace) || !jsonSafe(workspace)) return { ok: false, error: 'Workspace data is invalid or cannot be saved losslessly.' };
    const current = target.getItem(WORKSPACE_KEY);
    const legacy = target.getItem(BOARD_KEY);
    if (current !== snapshot.workspaceRaw || legacy !== snapshot.legacyRaw) {
      return { ok: false, error: 'Stored data changed since loading. Export your changes before reloading.' };
    }
    if (current !== null && !parseWorkspace(current)) return { ok: false, error: 'The saved workspace is unreadable. It was not overwritten.' };
    const nextRaw = JSON.stringify(workspace);
    if (!parseWorkspace(nextRaw)) return { ok: false, error: 'Workspace serialization failed validation.' };
    // This backup is made before changing the primary. Storage writes are not a cross-tab transaction.
    if (current !== null) target.setItem(WORKSPACE_BACKUP_KEY, current);
    target.setItem(WORKSPACE_KEY, nextRaw);
    return { ok: true, snapshot: { workspaceRaw: nextRaw, legacyRaw: legacy } };
  } catch {
    return { ok: false, error: 'Workspace could not be saved. Check browser storage permissions.' };
  }
}
