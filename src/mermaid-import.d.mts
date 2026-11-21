import type { Workspace } from './workspace.mjs';

export const MAX_MERMAID_IMPORT_BYTES: number;
export const MAX_MERMAID_IMPORT_NODES: number;
export const MAX_MERMAID_IMPORT_EDGES: number;
export const MAX_MERMAID_IMPORT_LABEL_CHARS: number;

export type MermaidImportNode = { id: string; label: string };
export type MermaidImportEdge = { source: string; target: string; label: string };
export type MermaidImportDiagram = { nodes: MermaidImportNode[]; edges: MermaidImportEdge[] };

export function parseMermaidFlowchart(text: string): MermaidImportDiagram;
export function validateMermaidImportDiagram(diagram: MermaidImportDiagram): boolean;
export function createMermaidBoard(
  workspace: Workspace,
  title: string,
  diagram: MermaidImportDiagram,
  idFactory?: () => string,
): { workspace: Workspace; boardId: string };
