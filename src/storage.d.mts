import type { Node, Edge } from '@xyflow/react';
export type Board = { nodes: Node[]; edges: Edge[] };
export const BOARD_KEY: string;
export function loadBoard(storage?: Storage): { board: Board; canSave: boolean; message: string };
export function saveBoard(board: Board, storage?: Storage): string;
