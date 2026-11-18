import type { Workspace } from './workspace.mjs';
import type { Suggestion } from './dependency-map.mjs';
export function addSuggestedDependencies(workspace: Workspace, boardId: string, suggestions: Suggestion[], makeId: () => string): Workspace;
