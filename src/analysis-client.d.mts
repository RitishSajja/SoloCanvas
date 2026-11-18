import type { Workspace } from './workspace.mjs';
import type { Suggestion, Diagnostic } from './dependency-map.mjs';
export function boardAnalysisSnapshot(workspace: Workspace, boardId: string): Workspace;
export function startDependencyAnalysis(workspace: Workspace, boardId: string): {
  promise: Promise<{ suggestions: Suggestion[]; diagnostics: Diagnostic[] }>;
  cancel(): void;
};
