import type { ComponentShape, Workspace } from './workspace.mjs';
import type { Suggestion } from './dependency-map.mjs';

type Position = { x: number; y: number };
type PlacementContext = {
  id: string;
  componentId: string;
  position: Position;
  shape: ComponentShape;
  size?: { width: number; height: number };
  miniBoardId?: string;
  fileMissing?: true;
};
type RelationshipContext = {
  id: string;
  sourcePlacementId: string;
  targetPlacementId: string;
  label: string;
  kind: 'manual' | 'inferred';
  evidence?: Required<Pick<Suggestion, 'sourcePath' | 'targetPath' | 'specifier' | 'line' | 'importKind'>>;
};
export type BoardContext = {
  format: 'solocanvas.board-context';
  version: 1;
  scope: { kind: 'board' } | { kind: 'connected-placements'; placementId: string };
  board: { id: string; title: string; parentPlacement: { boardId: string; placementId: string } | null };
  components: { id: string; label: string; kind: 'component' | 'file'; path?: string }[];
  placements: PlacementContext[];
  relationships: RelationshipContext[];
  notes: { id: string; position: Position; text?: string }[];
};
export function buildBoardContext(workspace: Workspace, boardId: string, options?: { includeNoteText?: boolean }): BoardContext;
