import type { Workspace, WorkspaceBoard } from './workspace.mjs';
import './delete-control.css';

export default function DeleteControl({ label, onDelete }: { label: string; onDelete: () => void }) {
  return <button type="button" className="item-delete nodrag nopan" aria-label={label} title={label}
    onClick={event => { event.stopPropagation(); onDelete(); }}
    onDoubleClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" />
    </svg>
  </button>;
}

export function deletionWarning(workspace: Workspace, tree: WorkspaceBoard[], nestedBoards: number, cardId?: string) {
  const affectedCards = new Set(tree.flatMap(board => board.nodes.map(node => node.cardId)));
  if (cardId) affectedCards.add(cardId);
  let sharedFiles = 0;
  for (const card of workspace.cards) {
    if (affectedCards.has(card.id)) sharedFiles += (card.attachments?.length ?? 0) + Number(card.data.kind === 'file');
  }
  const contents: string[] = [];
  function count(value: number, noun: string) {
    if (value) contents.push(value + ' ' + noun + (value === 1 ? '' : 's'));
  }
  count(nestedBoards, 'nested board');
  count(tree.reduce((sum, item) => sum + item.nodes.length, 0), 'component placement');
  count(tree.reduce((sum, item) => sum + item.notes.length, 0), 'sticky note');
  count(tree.reduce((sum, item) => sum + (item.attachments?.length ?? 0), 0), 'board file');
  const removed = contents.length ? 'This also removes ' + contents.join(', ') + '.' : '';
  const kept = sharedFiles ? sharedFiles + ' component ' + (sharedFiles === 1 ? 'file stays' : 'files stay') + ' with the reusable components.' : '';
  return [removed, kept].filter(Boolean).join(' ');
}
