import type { Edge } from '@xyflow/react';
import type { Workspace } from './workspace.mjs';
import type { Suggestion, Diagnostic } from './dependency-map.mjs';

export type DependencyChange = {
  key: string;
  kind: 'added' | 'updated' | 'removed';
  evidence: Suggestion;
  previous?: Suggestion;
  edgeId?: string;
};

export function isInferredDependency(edge: Edge): boolean;
export function prepareRefreshAnalysis(workspace: Workspace, boardId: string, contents: Map<string, string>): Workspace;
export function previewDependencyRefresh(workspace: Workspace, boardId: string, contents: Map<string, string>,
  result: { suggestions: Suggestion[]; diagnostics: Diagnostic[] }): DependencyChange[];
export function applyDependencyRefresh(workspace: Workspace, boardId: string, changes: DependencyChange[],
  selectedKeys: string[], makeId: () => string): Workspace;
