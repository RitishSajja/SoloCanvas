export const WORKSPACE_KEY: string;
export const WORKSPACE_BACKUP_KEY: string;
export const WORKSPACE_DAMAGED_KEY: string;
export type RecoverySnapshot = { primary: string; backup: string; legacy: string | null; damaged: string | null };
export function inspectWorkspaceRecovery(storage?: Storage):
  | { ok: true; snapshot: RecoverySnapshot }
  | { ok: false; error: string };
export function restoreWorkspaceBackup(snapshot: RecoverySnapshot, storage?: Storage):
  Promise<{ ok: true } | { ok: false; error: string }>;

export type WorkspaceSnapshot = { workspaceRaw: string | null; legacyRaw: string | null };
export function openWorkspace(storage?: Storage):
  | { ok: true; workspace: import('./workspace.mjs').Workspace; snapshot: WorkspaceSnapshot; source: 'empty' | 'legacy' | 'workspace' }
  | { ok: false; error: string };
export function writeWorkspaceLocked(workspace: import('./workspace.mjs').Workspace, snapshot: WorkspaceSnapshot, storage?: Storage):
  Promise<{ ok: true; snapshot: WorkspaceSnapshot } | { ok: false; error: string }>;
