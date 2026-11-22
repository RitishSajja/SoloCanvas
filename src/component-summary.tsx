import type { Workspace, WorkspaceBoard } from './workspace.mjs';
import './component-summary.css';

export type ComponentSummary = {
  filePath?: string;
  sourceLines?: number;
  attachments?: string;
  board?: {
    title: string;
    stats: string;
    files?: string;
    attachments?: string;
  };
};

function count(value: number, singular: string) {
  return `${value} ${singular}${value === 1 ? '' : 's'}`;
}

function shortList(names: string[]) {
  if (!names.length) return undefined;
  const preview = names.slice(0, 2).join(', ');
  return names.length > 2 ? `${preview} (+${names.length - 2} more)` : preview;
}

// A mini-board belongs to a placement, while a file and its attachments belong to
// the shared card. Two appearances of the same component can have different boards.
export function buildComponentSummaries(workspace: Workspace | null, boardId: string) {
  const summaries = new Map<string, ComponentSummary>();
  const current = workspace?.boards.find(board => board.id === boardId);
  if (!workspace || !current) return summaries;

  const cards = new Map(workspace.cards.map(card => [card.id, card]));
  const children = new Map<string, WorkspaceBoard>();
  for (const board of workspace.boards) {
    if (board.parentPlacement?.boardId === boardId) children.set(board.parentPlacement.nodeId, board);
  }
  for (const node of current.nodes) {
    const card = cards.get(node.cardId);
    if (!card) continue;
    const summary: ComponentSummary = {};
    if (card.data.kind === 'file' && typeof card.data.path === 'string') {
      summary.filePath = card.data.path;
      if (typeof card.data.sourceText === 'string') {
        const source = card.data.sourceText;
        const breaks = source.match(/\r\n|\r|\n/g)?.length ?? 0;
        summary.sourceLines = breaks + Number(source.length > 0 && !/[\r\n]$/.test(source));
      }
    }
    summary.attachments = shortList((card.attachments ?? []).map(file => file.name));
    const child = children.get(node.id);
    if (child) {
      const filePaths = new Set<string>();
      const attachedNames: string[] = [];
      // A reused child component shares both its file path and attachments.
      for (const childCardId of new Set(child.nodes.map(placement => placement.cardId))) {
        const childCard = cards.get(childCardId);
        if (!childCard) continue;
        if (childCard.data.kind === 'file' && typeof childCard.data.path === 'string') filePaths.add(childCard.data.path);
        for (const file of childCard.attachments ?? []) attachedNames.push(file.name);
      }
      const files = [...filePaths, ...attachedNames];
      summary.board = {
        title: child.title,
        stats: [count(child.nodes.length, 'component'), count(child.notes.length, 'note'),
          count(child.edges.length, 'connection')].join(' · '),
        files: files.length ? `${count(files.length, 'file')}: ${shortList(files)}` : undefined,
        attachments: shortList((child.attachments ?? []).map(file => file.name)),
      };
    }
    if (summary.filePath || summary.attachments || summary.board) summaries.set(node.id, summary);
  }
  return summaries;
}

export function ComponentDetails({ summary }: { summary?: ComponentSummary }) {
  if (!summary) return null;
  const { filePath, sourceLines, attachments, board } = summary;
  return <span className="component-details">
    {filePath && <span>File: {filePath}{sourceLines !== undefined && ` · ${count(sourceLines, 'line')}`}</span>}
    {attachments && <span>Attachments: {attachments}</span>}
    {board && <>
      <span>Board: {board.title}</span>
      <span>{board.stats}</span>
      {board.files && <span>{board.files}</span>}
      {board.attachments && <span>Board attachments: {board.attachments}</span>}
    </>}
  </span>;
}
