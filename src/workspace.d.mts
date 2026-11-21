import type { Node, Edge } from '@xyflow/react';
import type { Board } from './storage.mjs';
import type { MermaidImportDiagram } from './mermaid-import.mjs';
export type Card = { id: string; data: Record<string, unknown> };
export type Placement = Omit<Node, 'data'> & { cardId: string };
export type WorkspaceBoard = { id: string; title: string; extra: Record<string, unknown>; nodes: Placement[]; edges: Edge[] };
export type Workspace = { version: 2; cards: Card[]; boards: WorkspaceBoard[] };
export function projectBoard(workspace: Workspace, boardId: string): Board;
export function addBoard(workspace: Workspace, id: string, title: string): Workspace;
export function createMermaidBoard(
  workspace: Workspace,
  title: string,
  diagram: MermaidImportDiagram,
  idFactory?: () => string,
): { workspace: Workspace; boardId: string };
export function placeCard(workspace: Workspace, boardId: string, cardId: string, node: Omit<Placement, 'cardId'>): Workspace;
export function updateCard(workspace: Workspace, cardId: string, data: Record<string, unknown>): Workspace;
export function renameBoard(workspace: Workspace, boardId: string, title: string): Workspace;
export function removeBoard(workspace: Workspace, boardId: string): Workspace;
export type CardSearchResult = { cardId: string; label: string; placements: { boardId: string; boardTitle: string; nodeId: string }[] };
export function findCards(workspace: Workspace, query: string, options?: { includeSource?: boolean }): CardSearchResult[];
export function findCardPlacements(workspace: Workspace, cardId: string): CardSearchResult['placements'];
