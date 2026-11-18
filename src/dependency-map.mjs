// Static, local-only import suggestions for source text already on a board.
import ts from 'typescript';
import { validateWorkspace } from './workspace.mjs';

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const jsSource = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;

function relativeCandidates(from, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return [];
  if (/[?#\\\\]/.test(specifier)) return [];
  const parts = from.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return []; parts.pop(); }
    else parts.push(part);
  }
  const base = parts.join('/');
  if (!base) return [];
  const candidates = [base];
  // TypeScript commonly refers to emitted .js paths while the selected
  // source is .ts/.tsx. Consider all matches and refuse to guess if ambiguous.
  if (/\.(?:ts|tsx)$/i.test(from)) {
    const substitutions = [
      [/\.js$/i, ['.ts', '.tsx', '.d.ts']],
      [/\.jsx$/i, ['.tsx', '.d.ts']],
      [/\.mjs$/i, ['.mts', '.d.mts']],
      [/\.cjs$/i, ['.cts', '.d.cts']],
    ];
    for (const [pattern, endings] of substitutions) {
      if (pattern.test(base)) for (const ending of endings) candidates.push(base.replace(pattern, ending));
    }
  }
  if (!/\.[^/]+$/.test(base)) {
    for (const ext of extensions) candidates.push(base + ext, base + '/index' + ext);
  }
  return candidates;
}

// Does not read files or execute source. Only top-level static ESM imports and
// re-exports from the board's selected JS/TS paths are considered.
export function suggestDependencies(workspace, boardId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace.');
  const board = workspace.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found.');
  const cards = new Map(workspace.cards.map(card => [card.id, card]));
  const paths = new Map();
  for (const node of board.nodes) {
    const data = cards.get(node.cardId)?.data;
    if (data?.kind !== 'file' || typeof data.path !== 'string') continue;
    const entries = paths.get(data.path) ?? [];
    entries.push({ node, data }); paths.set(data.path, entries);
  }
  const sources = [...paths].filter(([path, items]) => jsSource.test(path) && items.some(item => typeof item.data.sourceText === 'string'));
  if (sources.length > 100) throw new Error('Analyze at most 100 source files at a time.');
  const encoder = new TextEncoder();
  const bytes = sources.reduce((sum, [, items]) => sum + items.reduce((n, item) => n + (typeof item.data.sourceText === 'string' ? encoder.encode(item.data.sourceText).length : 0), 0), 0);
  if (bytes > 512 * 1024) throw new Error('Analyze at most 512 KiB of source text at a time.');
  const existing = new Set(board.edges.map(edge => JSON.stringify([edge.source, edge.target])));
  const seen = new Set(existing);
  const suggestions = [];
  const diagnostics = [];
  const report = item => {
    if (diagnostics.length >= 250) throw new Error('Too many import diagnostics; reduce the selected files.');
    diagnostics.push(item);
  };
  for (const [path, items] of sources) {
    if (items.length !== 1) { report({ path, reason: 'multiple placements for this file' }); continue; }
    const { node, data } = items[0];
    const kind = /\.tsx$/i.test(path) ? ts.ScriptKind.TSX : /\.jsx$/i.test(path) ? ts.ScriptKind.JSX : /\.(?:ts)$/i.test(path) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const source = ts.createSourceFile(path, data.sourceText, ts.ScriptTarget.Latest, false, kind);
    if (source.parseDiagnostics.length) { report({ path, reason: 'source could not be parsed' }); continue; }
    const scanUnsupported = node => {
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        const arg = node.arguments[0];
        report({
          path,
          reason: node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic import not analyzed' : 'require call not analyzed',
          ...(arg && ts.isStringLiteral(arg) ? { specifier: arg.text } : {}),
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        });
      }
      ts.forEachChild(node, scanUnsupported);
    };
    scanUnsupported(source);
    for (const statement of source.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        report({ path, reason: 'non-relative import not analyzed', specifier, line: source.getLineAndCharacterOfPosition(statement.moduleSpecifier.getStart(source)).line + 1 });
        continue;
      }
      const matches = relativeCandidates(path, specifier).filter(candidate => paths.has(candidate));
      const line = source.getLineAndCharacterOfPosition(statement.moduleSpecifier.getStart(source)).line + 1;
      if (matches.length !== 1 || paths.get(matches[0]).length !== 1) {
        report({ path, reason: matches.length ? 'ambiguous local import' : 'unresolved local import', specifier, line });
        continue;
      }
      const target = paths.get(matches[0])[0].node;
      const key = JSON.stringify([node.id, target.id]);
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ sourceNodeId: node.id, targetNodeId: target.id, sourcePath: path, targetPath: matches[0], specifier, line });
      if (suggestions.length > 250) throw new Error('Too many suggested relationships; reduce the selected files.');
    }
  }
  return { suggestions, diagnostics };
}

export function addSuggestedDependencies(workspace, boardId, suggestions, makeId) {
  if (!validateWorkspace(workspace) || !Array.isArray(suggestions) || typeof makeId !== 'function') throw new Error('Invalid suggestions.');
  const next = structuredClone(workspace);
  const board = next.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found.');
  const nodes = new Set(board.nodes.map(node => node.id));
  const pairs = new Set(board.edges.map(edge => JSON.stringify([edge.source, edge.target])));
  for (const item of suggestions) {
    if (!nodes.has(item.sourceNodeId) || !nodes.has(item.targetNodeId) || typeof item.sourcePath !== 'string' ||
        typeof item.targetPath !== 'string' || typeof item.specifier !== 'string' || !Number.isInteger(item.line) || item.line < 1) {
      throw new Error('Invalid or stale suggestion.');
    }
    const pair = JSON.stringify([item.sourceNodeId, item.targetNodeId]);
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    board.edges.push({ id: makeId(), source: item.sourceNodeId, target: item.targetNodeId, label: 'imports',
      data: { sourcePath: item.sourcePath, targetPath: item.targetPath, specifier: item.specifier, line: item.line } });
  }
  if (!validateWorkspace(next)) throw new Error('Could not create unique relationships.');
  return next;
}
