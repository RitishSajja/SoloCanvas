import type { FileDetails, Workspace } from './workspace.mjs';

type PreviousPlacement = { nodeId: string; cardId: string; missing: boolean; sourceText?: unknown; fileDetails?: FileDetails };
export type MapFileChange = {
  path: string;
  kind: 'added' | 'changed' | 'missing' | 'restored' | 'baseline';
  folder: string;
  rootRelative: boolean;
  boardId: string;
  previous: PreviousPlacement[];
  sourceText?: string;
  fileDetails?: FileDetails;
};

export function previewMapRefresh(workspace: Workspace, boardId: string, paths: string[], contents?: Map<string, string>, details?: Map<string, FileDetails>, excludeGenerated?: boolean): MapFileChange[];
export function mapRefreshContents(workspace: Workspace, boardId: string, paths: string[], contents: Map<string, string>, excludeGenerated?: boolean): Map<string, string>;
export function applyMapRefresh(workspace: Workspace, boardId: string, changes: MapFileChange[], selectedPaths: string[], makeId: () => string): Workspace;
