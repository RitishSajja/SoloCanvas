import type { Node, Edge } from '@xyflow/react';
export type Board = { nodes: Node[]; edges: Edge[] };
export const BOARD_KEY: string;
export const BACKUP_KEY: string;
export function loadBoard(storage?: Storage): { board: Board; raw: string | null; canSave: boolean; canRestoreBackup: boolean; message: string };
export function saveBoard(board: Board, storage?: Storage, expectedRaw?: string | null): string;
export function restoreBackup(storage?: Storage):
  | { success: true; message: string; raw: string; board: Board }
  | { success: false; message: string };
