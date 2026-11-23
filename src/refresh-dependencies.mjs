import { boardAnalysisSnapshot } from './analysis-client.mjs';
import { addSuggestedDependencies, dependencyLabel } from './dependency-apply.mjs';
import { validateWorkspace } from './workspace.mjs';

const pairKey = (source, target) => JSON.stringify([source, target]);
const kinds = new Set(['static', 'type', 'dynamic', 'require']);

export function isInferredDependency(edge) {
  const data = edge?.data;
  return Boolean(data && typeof data.sourcePath === 'string' && data.sourcePath &&
    typeof data.targetPath === 'string' && data.targetPath &&
    typeof data.specifier === 'string' && data.specifier &&
    Number.isSafeInteger(data.line) && data.line > 0 &&
    (data.importKind === undefined || kinds.has(data.importKind)));
}

function edgeEvidence(edge) {
  const { sourcePath, targetPath, specifier, line, importKind = 'static' } = edge.data;
  return { sourceNodeId: edge.source, targetNodeId: edge.target, sourcePath, targetPath, specifier, line, importKind };
}

function sameEvidence(a, b) {
  return a.sourceNodeId === b.sourceNodeId && a.targetNodeId === b.targetNodeId &&
    a.sourcePath === b.sourcePath && a.targetPath === b.targetPath && a.line === b.line &&
    a.specifier === b.specifier && a.importKind === b.importKind;
}

function byPair(edges) {
  const pairs = new Map();
  for (const edge of edges) {
    const key = pairKey(edge.source, edge.target);
    const group = pairs.get(key) ?? [];
    group.push(edge);
    pairs.set(key, group);
  }
  return pairs;
}

// The existing worker skips pairs that already have an edge. Hide inferred
// edges during a refresh so the worker can return their latest source evidence.
export function prepareRefreshAnalysis(workspace, boardId, contents) {
  if (!(contents instanceof Map)) throw new Error('Invalid source selection.');
  const snapshot = boardAnalysisSnapshot(workspace, boardId);
  const original = workspace.boards.find(board => board.id === boardId);
  const board = snapshot.boards[0];
  const manual = new Set(original.edges.filter(edge => !isInferredDependency(edge)).map(edge => edge.id));
  board.edges = board.edges.filter(edge => manual.has(edge.id));
  for (const { data } of snapshot.cards) {
    if (!contents.has(data.path) || contents.get(data.path) !== data.sourceText) delete data.sourceText;
  }
  return snapshot;
}

export function previewDependencyRefresh(workspace, boardId, contents, result) {
  const input = prepareRefreshAnalysis(workspace, boardId, contents);
  const board = workspace.boards.find(item => item.id === boardId);
  const cardData = new Map(input.cards.map(card => [card.id, card.data]));
  const nodeData = new Map(input.boards[0].nodes.map(node => [node.id, cardData.get(node.cardId)]));
  const eligibleSource = (node, path) => node?.path === path && typeof node.sourceText === 'string' &&
    /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(path);
  const pairs = byPair(board.edges);
  const observed = new Set();
  const changes = [];
  for (const suggestion of result.suggestions) {
    const { sourceNodeId, targetNodeId, sourcePath, targetPath } = suggestion;
    if (!eligibleSource(nodeData.get(sourceNodeId), sourcePath) || nodeData.get(targetNodeId)?.path !== targetPath) continue;
    const key = pairKey(sourceNodeId, targetNodeId);
    observed.add(key);
    const group = pairs.get(key);
    if (!group) {
      changes.push({ key, kind: 'added', evidence: suggestion });
    } else if (group.length === 1 && isInferredDependency(group[0])) {
      const previous = edgeEvidence(group[0]);
      if (!sameEvidence(previous, suggestion)) {
        changes.push({ key, kind: 'updated', evidence: suggestion, previous, edgeId: group[0].id });
      }
    }
  }
  // Even a non-relative specifier may be a local alias. Keep existing links
  // when this analysis could not resolve every import in their source.
  const uncertain = new Set(result.diagnostics.map(item => item.path));
  for (const [key, group] of pairs) {
    if (observed.has(key) || group.length !== 1 || !isInferredDependency(group[0])) continue;
    const previous = edgeEvidence(group[0]);
    if (!eligibleSource(nodeData.get(previous.sourceNodeId), previous.sourcePath) || uncertain.has(previous.sourcePath)) continue;
    if (nodeData.get(previous.targetNodeId)?.path !== previous.targetPath) continue;
    changes.push({ key, kind: 'removed', evidence: previous, previous, edgeId: group[0].id });
  }
  return changes;
}

export function applyDependencyRefresh(workspace, boardId, changes, selectedKeys, makeId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace.');
  const board = workspace.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found.');
  const selected = new Set(selectedKeys);
  const items = changes.filter(change => selected.has(change.key));
  if (items.length !== selected.size) throw new Error('Unknown relationship change.');
  if (!items.length) return workspace;
  const pairs = byPair(board.edges);
  const adds = [];
  const edits = new Map();
  for (const change of items) {
    const { evidence } = change;
    const group = pairs.get(change.key);
    if (change.key !== pairKey(evidence.sourceNodeId, evidence.targetNodeId) || !isInferredDependency({ data: evidence })) {
      throw new Error('Invalid relationship change.');
    }
    if (change.kind === 'added') {
      if (group) throw new Error('Relationship preview is stale.');
      adds.push(evidence);
    } else {
      const edge = group?.[0];
      if (group?.length !== 1 || !isInferredDependency(edge) || edge.id !== change.edgeId ||
          !change.previous || !sameEvidence(edgeEvidence(edge), change.previous) ||
          (change.kind !== 'updated' && change.kind !== 'removed')) throw new Error('Relationship preview is stale.');
      edits.set(edge.id, change);
    }
  }
  const next = addSuggestedDependencies(workspace, boardId, adds, makeId);
  const nextBoard = next.boards.find(item => item.id === boardId);
  nextBoard.edges = nextBoard.edges.filter(edge => {
    const change = edits.get(edge.id);
    if (!change) return true;
    if (change.kind === 'removed') return false;
    const { sourcePath, targetPath, specifier, line, importKind } = change.evidence;
    if (edge.label === dependencyLabel(edge.data.importKind)) edge.label = dependencyLabel(importKind);
    Object.assign(edge.data, { sourcePath, targetPath, specifier, line, importKind });
    return true;
  });
  return next;
}
