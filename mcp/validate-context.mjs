import { connectedPlacementContext } from '../src/connected-context.mjs';
import { isInferredDependency } from '../src/refresh-dependencies.mjs';
import { isContextRegion, STICKY_NOTE_SIZE } from '../src/spatial-context.mjs';
import { COMPONENT_SHAPES } from '../src/workspace.mjs';

const text = value => typeof value === 'string';
const id = value => text(value) && value.length > 0;
const positive = value => Number.isFinite(value) && value > 0;
const list = check => value => Array.isArray(value) && value.every(check);

// Accept only the JSON fields that buildBoardContext intentionally discloses.
function record(required, optional = {}) {
  const fields = new Map(Object.entries({ ...required, ...optional }));
  const requiredKeys = Object.keys(required);
  return value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    requiredKeys.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => fields.has(key) && fields.get(key)(value[key]));
}

const position = record({ x: Number.isFinite, y: Number.isFinite });
const size = record({ width: positive, height: positive });
const parent = record({ boardId: id, placementId: id });
const board = record({ id, title: text, parentPlacement: value => value === null || parent(value) });
const wholeScope = record({ kind: value => value === 'board' });
const connectedScope = record({ kind: value => value === 'connected-placements', placementId: id });
const regionScope = record({
  kind: value => value === 'region', x: Number.isFinite, y: Number.isFinite, width: positive, height: positive,
});
const scope = value => wholeScope(value) || connectedScope(value) || (regionScope(value) && isContextRegion(value));
const fileComponent = record({ id, label: text, kind: value => value === 'file' }, { path: text });
const plainComponent = record({ id, label: text, kind: value => value === 'component' });
const placement = record({ id, componentId: id, shape: value => COMPONENT_SHAPES.includes(value), position },
  { size, miniBoardId: id, fileMissing: value => value === true });
const evidence = record({ sourcePath: id, targetPath: id, specifier: id, line: Number.isSafeInteger, importKind: text });
const relationshipFields = { id, sourcePlacementId: id, targetPlacementId: id, label: text };
const manual = record({ ...relationshipFields, kind: value => value === 'manual' });
const inferred = record({ ...relationshipFields, kind: value => value === 'inferred',
  evidence: value => evidence(value) && isInferredDependency({ data: value }) });
const note = record({ id, position }, { text });
const snapshot = record({
  format: value => value === 'solocanvas.board-context', version: value => value === 1, scope, board,
  components: list(value => fileComponent(value) || plainComponent(value)),
  placements: list(placement), relationships: list(value => manual(value) || inferred(value)), notes: list(note),
});

function invalid() {
  throw new Error('Invalid SoloCanvas board-context export.');
}

function ids(items) {
  const result = new Set(items.map(item => item.id));
  if (result.size !== items.length) invalid();
  return result;
}

export function validateContext(value) {
  if (!snapshot(value)) invalid();
  const { board, components, placements, relationships, notes, scope } = value;
  const componentIds = ids(components);
  const placementIds = ids(placements);
  const noteIds = ids(notes);
  ids(relationships);
  const placedComponents = new Set(placements.map(item => item.componentId));
  if (placedComponents.size !== componentIds.size || !placements.every(item => componentIds.has(item.componentId))) invalid();
  if (placements.some(item => noteIds.has(item.id))) invalid();
  if (relationships.some(edge => !placementIds.has(edge.sourcePlacementId) || !placementIds.has(edge.targetPlacementId))) invalid();
  const miniBoardIds = placements.flatMap(item => item.miniBoardId === undefined ? [] : [item.miniBoardId]);
  if (board.parentPlacement?.boardId === board.id || new Set(miniBoardIds).size !== miniBoardIds.length ||
    miniBoardIds.includes(board.id) || miniBoardIds.includes(board.parentPlacement?.boardId)) invalid();
  // The exporter applies a single note-text disclosure choice to the whole scope.
  if (notes.some(item => Object.hasOwn(item, 'text')) && !notes.every(item => Object.hasOwn(item, 'text'))) invalid();
  // Placement origins from imported diagrams are not part of the export, but note bounds are fixed.
  if (scope.kind === 'region' && notes.some(({ position }) =>
    position.x >= scope.x + scope.width || position.x + STICKY_NOTE_SIZE.width <= scope.x ||
    position.y >= scope.y + scope.height || position.y + STICKY_NOTE_SIZE.height <= scope.y)) invalid();
  if (scope.kind === 'connected-placements') {
    if (notes.length || !placementIds.has(scope.placementId)) invalid();
    if (connectedPlacementContext(value, scope.placementId).placements.length !== placements.length) invalid();
  }
  return value;
}
