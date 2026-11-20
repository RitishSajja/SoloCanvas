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

// Type-only imports do not imply a runtime dependency.
function isTypeOnly(statement) {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    const bindings = clause.namedBindings;
    return !clause.name && !!bindings && ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly);
  }
  if (statement.isTypeOnly) return true;
  const clause = statement.exportClause;
  return !!clause && ts.isNamedExports(clause) && clause.elements.length > 0 &&
    clause.elements.every(item => item.isTypeOnly);
}

// Does not read files or execute source. Only top-level static ESM imports and
// re-exports, TS import-equals and literal dynamic imports from selected JS/TS paths are considered.
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
  const suggestionIndex = new Map();
  const priority = { type: 0, dynamic: 1, require: 2, static: 3 };
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
    const consider = (specifier, line, importKind) => {
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        report({ path, reason: importKind === 'dynamic' ? 'non-relative dynamic import not analyzed' : 'non-relative import not analyzed', specifier, line });
        return;
      }
      const matches = relativeCandidates(path, specifier).filter(candidate => paths.has(candidate));
      if (matches.length !== 1 || paths.get(matches[0]).length !== 1) {
        const candidates = matches.flatMap(targetPath => paths.get(targetPath).map(entry => ({ targetPath, targetNodeId: entry.node.id, alreadyConnected: existing.has(JSON.stringify([node.id, entry.node.id])) })));
        report({ path, reason: candidates.length > 25 ? 'ambiguous local import (more than 25 candidate placements)' : matches.length ? 'ambiguous local import' : 'unresolved local import', specifier, line,
          ...(candidates.length > 1 && candidates.length <= 25 ? { sourceNodeId: node.id, importKind, candidates } : {}),
        });
        return;
      }
      const target = paths.get(matches[0])[0].node;
      const key = JSON.stringify([node.id, target.id]);
      if (existing.has(key)) return;
      const suggestion = { sourceNodeId: node.id, targetNodeId: target.id, sourcePath: path, targetPath: matches[0], specifier, line, importKind };
      const previous = suggestionIndex.get(key);
      if (previous !== undefined) {
        if (priority[importKind] > priority[suggestions[previous].importKind]) suggestions[previous] = suggestion;
        return;
      }
      suggestionIndex.set(key, suggestions.length);
      suggestions.push(suggestion);
      if (suggestions.length > 250) throw new Error('Too many suggested relationships; reduce the selected files.');
    };
    // Keep one relationship per pair, preferring runtime imports over type-only imports.
    for (const statement of source.statements) {
      if (ts.isImportEqualsDeclaration(statement) && ts.isExternalModuleReference(statement.moduleReference)) {
        const reference = statement.moduleReference.expression;
        if (reference && ts.isStringLiteral(reference)) {
          const line = source.getLineAndCharacterOfPosition(reference.getStart(source)).line + 1;
          consider(reference.text, line, statement.isTypeOnly ? 'type' : 'require');
        }
        continue;
      }
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const line = source.getLineAndCharacterOfPosition(statement.moduleSpecifier.getStart(source)).line + 1;
      consider(statement.moduleSpecifier.text, line, isTypeOnly(statement) ? 'type' : 'static');
    }
    const scanCalls = current => {
      if (ts.isCallExpression(current) && current.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = current.arguments[0];
        const line = source.getLineAndCharacterOfPosition(current.getStart(source)).line + 1;
        if (arg && ts.isStringLiteral(arg)) consider(arg.text, line, 'dynamic');
        else report({ path, reason: 'dynamic import expression not analyzed', line });
      } else if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === 'require') {
        const arg = current.arguments[0];
        report({ path, reason: 'require call not analyzed',
          ...(arg && ts.isStringLiteral(arg) ? { specifier: arg.text } : {}),
          line: source.getLineAndCharacterOfPosition(current.getStart(source)).line + 1 });
      }
      ts.forEachChild(current, scanCalls);
    };
    scanCalls(source);
  }
  return { suggestions, diagnostics };
}

export { addSuggestedDependencies } from './dependency-apply.mjs';
