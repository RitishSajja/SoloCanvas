import { validateWorkspace } from './workspace.mjs';

const MAX_NODES = 1000;
const MAX_EDGES = 3000;
const MAX_LABEL_CHARS = 512;

// Mermaid flowchart entity codes protect diagram syntax from user-provided text.
function escapeLabel(value) {
  const label = String(value ?? '');
  const characters = Array.from(label);
  if (characters.length > MAX_LABEL_CHARS) throw new Error('Mermaid labels must be at most 512 characters.');
  return characters.map(character => /[A-Za-z0-9 _.,:/-]/.test(character)
    ? character : '#' + character.codePointAt(0) + ';').join('');
}

/** Export a lossy, one-way Mermaid flowchart of the current board. */
export function exportBoardMermaid(workspace, boardId) {
  if (!validateWorkspace(workspace)) throw new Error('Invalid workspace.');
  const board = workspace.boards.find(item => item.id === boardId);
  if (!board) throw new Error('Board not found.');
  if (board.nodes.length === 0) throw new Error('Add a component before exporting Mermaid.');
  if (board.nodes.length > MAX_NODES || board.edges.length > MAX_EDGES) throw new Error('Mermaid export supports at most 1000 components and 3000 relationships.');
  const cards = new Map(workspace.cards.map(card => [card.id, card]));
  const ids = new Map(board.nodes.map((node, index) => [node.id, 'n' + index]));
  const lines = ['flowchart LR'];
  for (const node of board.nodes) {
    const label = cards.get(node.cardId).data.label;
    lines.push('  ' + ids.get(node.id) + '["' + escapeLabel(label ?? 'Untitled') + '"]');
  }
  for (const edge of board.edges) {
    const label = escapeLabel(edge.label ?? '');
    lines.push('  ' + ids.get(edge.source) + (label ? ' -->|' + label + '| ' : ' --> ') + ids.get(edge.target));
  }
  return lines.join('\n') + '\n';
}
