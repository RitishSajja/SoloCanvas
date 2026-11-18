import type { Workspace } from './workspace.mjs';
export const MAX_MAP_FILES: number;
export function validateFilePaths(paths: string[]): string[];
export function createFileMap(workspace: Workspace, boardId: string, title: string, paths: string[], makeId: () => string): Workspace;
