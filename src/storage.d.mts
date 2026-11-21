import type { Node, Edge } from '@xyflow/react';
export type Board = { nodes: Node[]; edges: Edge[] };
export const BOARD_KEY: string;
export const WORKSPACE_KEY: string;
export const WORKSPACE_BACKUP_KEY: string;
export const WORKSPACE_DAMAGED_KEY: string;
export const WORKSPACE_LOCK: string;
export const BACKUP_KEY: string;
export const ONBOARDING_KEY: string;
export function getFirstRunStatus(storage?: Storage): 'first-run' | 'existing-data' | 'already-complete' | 'unavailable';
export function parseBoard(raw: string): Board | null;
export function isFirstRun(storage?: Storage): boolean;
export function completeOnboarding(storage?: Storage): 'saved' | 'already-complete' | 'existing-data' | 'unavailable';
export function loadBoard(storage?: Storage): { board: Board; raw: string | null; canSave: boolean; canRestoreBackup: boolean; firstRun: boolean; message: string };
export function saveBoard(board: Board, storage?: Storage, expectedRaw?: string | null): string;
export function restoreBackup(storage?: Storage):
  | { success: true; message: string; raw: string; board: Board }
  | { success: false; message: string };

export function saveBoardSafely(board: Board, storage?: Storage, expectedRaw?: string | null): Promise<string>;
export function restoreBackupSafely(storage?: Storage): ReturnType<typeof restoreBackup> extends infer R ? Promise<R> : never;
