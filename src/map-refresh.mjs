import { MAX_SOURCE_FILE_BYTES, MAX_SOURCE_TOTAL_BYTES, getFileDetails, isGeneratedFolderPath, validateFilePaths } from './file-map.mjs';
import { validateWorkspace } from './workspace.mjs';

function indexFiles(workspace, boardId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace.');
  const board = workspace.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found.');
  const cards = new Map(workspace.cards.map(card => [card.id, card]));
  const files = new Map();
  for (const node of board.nodes) {
    const card = cards.get(node.cardId);
    if (card.data.kind !== 'file' || typeof card.data.path !== 'string') continue;
    const path = card.data.path;
    if (!files.has(path)) files.set(path, []);
    files.get(path).push({ node, card });
  }
  return { board, files };
}

function folderSelection(workspace, boardId, paths, contents, excludeGenerated) {
  if (!Array.isArray(paths) || !paths.length) throw new Error('Select a folder containing at least one file so its name can be verified.');
  const folder = typeof paths[0] === 'string' ? paths[0].split('/')[0] : '';
  validateFilePaths([folder]);
  if (!paths.every(path => typeof path === 'string' && path.startsWith(folder + '/') && !path.endsWith('/'))) {
    throw new Error('Select one project folder.');
  }
  // The picker supplies a folder name even when all its files are excluded.
  const retained = excludeGenerated ? paths.filter(path => !isGeneratedFolderPath(path)) : paths;
  const names = retained.length ? validateFilePaths(retained) : [];
  const { board, files } = indexFiles(workspace, boardId);
  let rootRelative = false;
  if (board.fileMapFolder) {
    if (board.fileMapFolder.name !== folder) throw new Error('Select the original folder: ' + board.fileMapFolder.name);
    rootRelative = board.fileMapFolder.rootRelative === true;
  } else if (files.size && [...files.keys()].every(path => path.startsWith(folder + '/'))) {
    // Earlier folder maps already stored their directory picker prefix.
  } else if (files.size && [...files.keys()].every(path => !path.includes('/'))) {
    // Older maps created by selecting individual files have no folder identity.
    if (!names.some(path => files.has(path.slice(folder.length + 1)))) {
      throw new Error('Select a folder containing at least one of the originally mapped files.');
    }
    rootRelative = true;
  } else {
    throw new Error('Select the original project folder for a board containing mapped files.');
  }
  const toBoardPath = path => rootRelative ? path.slice(folder.length + 1) : path;
  const selectedPaths = names.map(toBoardPath);
  const source = new Map();
  if (!(contents instanceof Map)) throw new Error('Invalid source contents.');
  let total = 0;
  const encoder = new TextEncoder();
  for (const [path, text] of contents) {
    if (!names.includes(path) || typeof text !== 'string' || text.includes('\0') || text.length > MAX_SOURCE_FILE_BYTES) {
      throw new Error('Invalid source contents.');
    }
    const bytes = encoder.encode(text).length;
    total += bytes;
    if (bytes > MAX_SOURCE_FILE_BYTES || total > MAX_SOURCE_TOTAL_BYTES) throw new Error('Refresh source exceeds the size limit.');
    source.set(toBoardPath(path), text);
  }
  return { files, folder, rootRelative, selectedPaths, source };
}

export function mapRefreshContents(workspace, boardId, paths, contents, excludeGenerated = false) {
  return folderSelection(workspace, boardId, paths, contents, excludeGenerated).source;
}

function previousState(placements) {
  return placements.map(({ node, card }) => ({
    nodeId: node.id, cardId: card.id, missing: node.fileMissing === true, sourceText: card.data.sourceText,
    fileDetails: getFileDetails(node.fileDetails),
  }));
}

function sameFileDetails(left, right) {
  return left?.size === right?.size && left?.lastModified === right?.lastModified;
}

export function previewMapRefresh(workspace, boardId, paths, contents = new Map(), details = new Map(), excludeGenerated = false) {
  const { files, folder, rootRelative, selectedPaths, source } = folderSelection(workspace, boardId, paths, contents, excludeGenerated);
  const selected = new Set(selectedPaths);
  const changes = [];
  for (const path of new Set([...selected, ...files.keys()])) {
    if (!rootRelative && !path.startsWith(folder + '/')) continue;
    if (excludeGenerated && isGeneratedFolderPath(rootRelative ? folder + '/' + path : path)) continue;
    const placements = files.get(path) ?? [];
    const previous = previousState(placements);
    const fileDetails = selected.has(path) ? getFileDetails(details.get(rootRelative ? folder + '/' + path : path)) : undefined;
    let kind;
    if (!placements.length) kind = 'added';
    else if (!selected.has(path)) {
      if (placements.every(({ node }) => node.fileMissing === true)) continue;
      kind = 'missing';
    } else if (previous.some(item => item.missing)) kind = 'restored';
    else if (source.has(path) && previous.some(item => item.sourceText !== source.get(path))) kind = 'changed';
    else if (fileDetails && previous.some(item => item.fileDetails && !sameFileDetails(item.fileDetails, fileDetails))) kind = 'changed';
    else if (fileDetails && previous.some(item => !item.fileDetails)) kind = 'baseline';
    else continue;
    changes.push({ path, kind, folder, rootRelative, boardId, previous, ...(fileDetails ? { fileDetails } : {}),
      ...(source.has(path) ? { sourceText: source.get(path) } : {}) });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

export function applyMapRefresh(workspace, boardId, changes, selectedPaths, makeId) {
  if (!Array.isArray(changes) || !Array.isArray(selectedPaths) || typeof makeId !== 'function') throw new Error('Invalid refresh selection.');
  if (!selectedPaths.length) return workspace;
  const proposed = new Map(changes.map(item => [item.path, item]));
  const next = structuredClone(workspace);
  const { board, files } = indexFiles(next, boardId);
  if (proposed.size !== changes.length || new Set(selectedPaths).size !== selectedPaths.length) throw new Error('Duplicate refresh selection.');
  let added = 0;
  let newRowY = 0;
  for (const item of [...board.nodes, ...board.notes]) {
    newRowY = Math.max(newRowY, item.position.y + (item.measured?.height ?? item.height ?? 148) + 48);
  }
  for (const path of selectedPaths) {
    const change = proposed.get(path);
    if (!change || change.boardId !== boardId) throw new Error('Unknown or stale refresh selection.');
    const placements = files.get(path) ?? [];
    const current = previousState(placements);
    if (current.length !== change.previous.length || current.some((item, i) => {
      const prior = change.previous[i];
      return item.nodeId !== prior.nodeId || item.cardId !== prior.cardId || item.missing !== prior.missing ||
        item.sourceText !== prior.sourceText || !sameFileDetails(item.fileDetails, prior.fileDetails);
    })) throw new Error('A mapped file changed. Review the folder again.');
    if (board.fileMapFolder && (board.fileMapFolder.name !== change.folder || board.fileMapFolder.rootRelative !== change.rootRelative)) {
      throw new Error('The mapped folder changed. Review the folder again.');
    }
    board.fileMapFolder = { name: change.folder, rootRelative: change.rootRelative };
    if (change.kind === 'added') {
      const cardId = makeId();
      const data = { kind: 'file', path, label: path };
      if (typeof change.sourceText === 'string') data.sourceText = change.sourceText;
      next.cards.push({ id: cardId, data });
      board.nodes.push({ id: makeId(), cardId, shape: 'pill',
        ...(change.fileDetails ? { fileDetails: { ...change.fileDetails } } : {}),
        position: { x: (added % 4) * 300, y: newRowY + Math.floor(added / 4) * 200 } });
      added++;
    } else {
      for (const { node, card } of placements) {
        if (change.kind === 'missing') node.fileMissing = true;
        else {
          delete node.fileMissing;
          if (change.fileDetails) node.fileDetails = { ...change.fileDetails };
          if (typeof change.sourceText === 'string') card.data.sourceText = change.sourceText;
        }
      }
    }
  }
  if (!validateWorkspace(next)) throw new Error('Refresh could not create valid file placements.');
  return next;
}
