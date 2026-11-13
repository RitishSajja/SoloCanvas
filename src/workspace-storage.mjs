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
    ok = Reflect.ownKeys(value).length === value.length + 1 &&
      Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index) && jsonSafe(value[index], ancestors)).every(Boolean);
  } else {
    const keys = Object.keys(value);
    ok = Reflect.ownKeys(value).length === keys.length && keys.every(key => jsonSafe(value[key], ancestors));
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

export const WORKSPACE_LOCK = 'solocanvas.workspace.v2.write';

// All cooperating v2 writers must use this wrapper. Unlocked or older v1 writers
// do not participate. Fail closed where Web Locks is unavailable.
export async function writeWorkspaceLocked(workspace, snapshot, storage, locks = globalThis.navigator?.locks) {
  if (!locks || typeof locks.request !== 'function') {
    return { ok: false, error: 'Safe workspace saving requires browser lock support. Export your changes.' };
  }
  try {
    return await locks.request(WORKSPACE_LOCK, { mode: 'exclusive' },
      () => writeWorkspace(workspace, snapshot, storage));
  } catch {
    return { ok: false, error: 'Could not obtain the workspace save lock. Export your changes.' };
  }
}

export const WORKSPACE_DAMAGED_KEY = 'solocanvas.workspace.damaged.v2';

function isUnknownVersion(raw) {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) &&
      Object.hasOwn(value, 'version') && value.version !== 2;
  } catch { return false; }
}

// Inspect only: callers can offer the raw primary and backup for export before
// asking a user to restore. Unknown versions are never treated as corruption.
export function inspectWorkspaceRecovery(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const primary = target.getItem(WORKSPACE_KEY);
    const backup = target.getItem(WORKSPACE_BACKUP_KEY);
    const legacy = target.getItem(BOARD_KEY);
    const damaged = target.getItem(WORKSPACE_DAMAGED_KEY);
    if (primary === null || parseWorkspace(primary)) return { ok: false, error: 'The current workspace is not damaged.' };
    if (isUnknownVersion(primary)) return { ok: false, error: 'The workspace has an unsupported version. Do not restore over it.' };
    if (!backup || !parseWorkspace(backup)) return { ok: false, error: 'No valid workspace backup is available.' };
    if (damaged !== null && damaged !== primary) return { ok: false, error: 'A previous damaged workspace is already preserved. Export it before recovery.' };
    return { ok: true, snapshot: { primary, backup, legacy, damaged } };
  } catch {
    return { ok: false, error: 'Workspace recovery data could not be read.' };
  }
}

// Restore is serialized with cooperating v2 writers. The corrupt primary is
// archived before replacement. The legacy board and backup are never removed.
export async function restoreWorkspaceBackup(snapshot, storage, locks = globalThis.navigator?.locks) {
  if (!locks || typeof locks.request !== 'function') return { ok: false, error: 'Safe recovery requires browser lock support.' };
  try {
    return await locks.request(WORKSPACE_LOCK, { mode: 'exclusive' }, () => {
      try {
        const target = storage ?? globalThis.localStorage;
        const inspected = inspectWorkspaceRecovery(target);
        if (!inspected.ok) return inspected;
        const current = inspected.snapshot;
        if (!snapshot || ['primary', 'backup', 'legacy', 'damaged'].some(key => snapshot[key] !== current[key])) {
          return { ok: false, error: 'Recovery data changed since inspection. Inspect again.' };
        }
        target.setItem(WORKSPACE_DAMAGED_KEY, current.primary);
        target.setItem(WORKSPACE_KEY, current.backup);
        return { ok: true, workspace: parseWorkspace(current.backup), snapshot: { workspaceRaw: current.backup, legacyRaw: current.legacy } };
      } catch {
        return { ok: false, error: 'Recovery could not be completed. The original data may still be present.' };
      }
    });
  } catch {
    return { ok: false, error: 'Could not obtain the workspace recovery lock.' };
  }
}
