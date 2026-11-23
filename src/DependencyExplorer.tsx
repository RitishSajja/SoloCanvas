import { useMemo, useState } from 'react';
import type { Edge } from '@xyflow/react';
import type { Workspace } from './workspace.mjs';
import { isInferredDependency } from './refresh-dependencies.mjs';
import './dependency-explorer.css';

type Direction = 'outgoing' | 'incoming';
type Link = { boardId: string; boardTitle: string; nodeId: string; cardId: string; label: string; edge: Edge };

function indexLinks(workspace: Workspace) {
  const labels = new Map(workspace.cards.map(card => [card.id, String(card.data.label || card.data.path || 'Untitled component')]));
  const outgoing = new Map<string, Link[]>();
  const incoming = new Map<string, Link[]>();
  const add = (index: Map<string, Link[]>, id: string, link: Link) => {
    const links = index.get(id);
    if (links) links.push(link);
    else index.set(id, [link]);
  };
  for (const board of workspace.boards) {
    const nodes = new Map(board.nodes.map(node => [node.id, node.cardId]));
    for (const edge of board.edges) {
      const source = nodes.get(edge.source);
      const target = nodes.get(edge.target);
      if (!source || !target) continue;
      const common = { boardId: board.id, boardTitle: board.title, edge };
      add(outgoing, source, { ...common, nodeId: edge.target, cardId: target, label: labels.get(target)! });
      add(incoming, target, { ...common, nodeId: edge.source, cardId: source, label: labels.get(source)! });
    }
  }
  return { outgoing, incoming };
}

type Props = { workspace: Workspace; cardId: string; openPlacement: (boardId: string, nodeId: string) => void };

function Relationships({ workspace, cardId, openPlacement }: Props) {
  const index = useMemo(() => indexLinks(workspace), [workspace]);
  const [expanded, setExpanded] = useState('');
  function destination(link: Link) {
    const data = link.edge.data;
    const source = isInferredDependency(link.edge) && data;
    return <>
      <button type="button" onClick={() => openPlacement(link.boardId, link.nodeId)}>
        {link.label} on {link.boardTitle}
      </button>
      <small>{source ? `Inferred · ${data.sourcePath}:${data.line} · ${data.specifier}`
        : `Manual${link.edge.label ? ' · ' + String(link.edge.label) : ''}`}</small>
    </>;
  }
  function directionList(direction: Direction, heading: string) {
    const links = index[direction].get(cardId) ?? [];
    return <section aria-label={heading}>
      <h3>{heading} ({links.length})</h3>
      {links.length > 0 && <ul>{links.map(link => {
        const key = JSON.stringify([direction, link.boardId, link.edge.id]);
        const more = index[direction].get(link.cardId);
        return <li key={key}>{destination(link)}
          {link.cardId !== cardId && more?.some(next => next.cardId !== cardId) && <>
            <button type="button" aria-expanded={expanded === key} onClick={() => setExpanded(expanded === key ? '' : key)}>
              {expanded === key ? 'Hide' : 'Show'} next level for {link.label}
            </button>
            {expanded === key && <ul>{more.filter(next => next.cardId !== cardId).map(next =>
              <li key={JSON.stringify([next.boardId, next.edge.id])}>{destination(next)}</li>)}</ul>}
          </>}
        </li>;
      })}</ul>}
    </section>;
  }
  return <>{directionList('outgoing', 'Depends on')}{directionList('incoming', 'Used by')}</>;
}

export default function DependencyExplorer(props: Props) {
  const [opened, setOpened] = useState(false);
  return <details className="dependency-explorer" onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>Dependency explorer</summary>
    {opened && <Relationships key={props.cardId} {...props} />}
  </details>;
}
