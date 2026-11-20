import type { Workspace } from './workspace.mjs';
export type Suggestion = { sourceNodeId: string; targetNodeId: string; sourcePath: string; targetPath: string; specifier: string; line: number; importKind: 'static' | 'dynamic' | 'type' };
export type Diagnostic = { path: string; reason: string; specifier?: string; line?: number; sourceNodeId?: string; importKind?: 'static' | 'dynamic' | 'type'; candidates?: { targetPath: string; targetNodeId: string; alreadyConnected: boolean }[] };
export function suggestDependencies(workspace: Workspace, boardId: string): { suggestions: Suggestion[]; diagnostics: Diagnostic[] };
export function addSuggestedDependencies(workspace: Workspace, boardId: string, suggestions: Suggestion[], makeId: () => string): Workspace;
