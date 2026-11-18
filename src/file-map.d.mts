import type { Workspace } from './workspace.mjs';
export const MAX_MAP_FILES: number;
export function validateFilePaths(paths: string[]): string[];
export function createFileMap(workspace: Workspace, boardId: string, title: string, paths: string[], makeId: () => string, contents?: Map<string, string>): Workspace;
export const MAX_SOURCE_FILE_BYTES: number;
export const MAX_SOURCE_TOTAL_BYTES: number;
export function readSelectedSources(entries: { path: string; file: File }[]): Promise<{ contents: Map<string, string>; skipped: { path: string; reason: string }[] }>;
