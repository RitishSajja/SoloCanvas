export const WORKSPACE_KEY: string;
export const WORKSPACE_BACKUP_KEY: string;
export const WORKSPACE_DAMAGED_KEY: string;
export type RecoverySnapshot = { primary: string; backup: string; legacy: string | null; damaged: string | null };
export function inspectWorkspaceRecovery(storage?: Storage):
  | { ok: true; snapshot: RecoverySnapshot }
  | { ok: false; error: string };
export function restoreWorkspaceBackup(snapshot: RecoverySnapshot, storage?: Storage):
  Promise<{ ok: true } | { ok: false; error: string }>;
