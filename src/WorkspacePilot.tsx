import { useEffect, useRef, useState } from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import { addBoard, placeCard, projectBoard, updateCard, type Workspace } from './workspace.mjs';
import { openWorkspace, writeWorkspaceLocked, type WorkspaceSnapshot } from './workspace-storage.mjs';

export default function WorkspacePilot({ onClose }: { onClose: (saved: boolean) => void }) {
  const [initial] = useState(() => openWorkspace());
  const [workspace, setWorkspace] = useState<Workspace | null>(initial.ok ? initial.workspace : null);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(initial.ok ? initial.snapshot : null);
  const [boardId, setBoardId] = useState(initial.ok ? initial.workspace.boards[0]?.id ?? '' : '');
  const [cardId, setCardId] = useState('');
  const [selectedNode, setSelectedNode] = useState('');
  const [message, setMessage] = useState(initial.ok ? 'Workspace opened. Changes are not saved automatically.' : initial.error);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const editVersion = useRef(0);
  const inFlight = useRef(false);
  const savedOnce = useRef(false);

  const changed = (next: Workspace) => { editVersion.current += 1; setWorkspace(next); setDirty(true); };
  const board = workspace?.boards.find(item => item.id === boardId);
  const selected = board?.nodes.find(item => item.id === selectedNode);
  const selectedCard = workspace?.cards.find(item => item.id === selected?.cardId);
  const view = workspace && board ? projectBoard(workspace, board.id) : null;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const close = () => {
    if (inFlight.current) return;
    if (dirty && !window.confirm('Leave this workspace and discard its unsaved changes? Export first if needed.')) return;
    onClose(savedOnce.current || (initial.ok && initial.source === 'workspace'));
  };
  const createBoard = () => {
    if (!workspace) return;
    const title = window.prompt('Name the new board', 'New board');
    if (title === null || !title.trim()) return;
    const id = crypto.randomUUID();
    changed(addBoard(workspace, id, title.trim())); setBoardId(id); setSelectedNode('');
  };
  const addComponent = () => {
    if (!workspace || !board) return;
    const next = structuredClone(workspace);
    const card = { id: crypto.randomUUID(), data: { label: 'New component' } };
    next.cards.push(card);
    const target = next.boards.find(item => item.id === board.id)!;
    target.nodes.push({ id: crypto.randomUUID(), cardId: card.id, position: { x: 60 + target.nodes.length * 35, y: 60 + target.nodes.length * 35 } });
    changed(next);
  };
  const reuse = () => {
    if (!workspace || !board || !cardId) return;
    changed(placeCard(workspace, board.id, cardId, { id: crypto.randomUUID(), position: { x: 60 + board.nodes.length * 35, y: 60 + board.nodes.length * 35 } }));
  };
  const save = async () => {
    if (!workspace || !snapshot || inFlight.current) return;
    if (snapshot.workspaceRaw === null && !window.confirm('Save this workspace on this device? Your existing board is preserved, but older editors will not be able to save it. Export a backup first.')) return;
    inFlight.current = true; setBusy(true);
    const version = editVersion.current;
    try {
      const result = await writeWorkspaceLocked(workspace, snapshot);
      if (!result.ok) { setMessage(result.error); return; }
      setSnapshot(result.snapshot); savedOnce.current = true;
      if (version === editVersion.current) { setDirty(false); setMessage('Workspace saved on this device.'); }
      else setMessage('Saved an earlier version. Newer changes remain unsaved.');
    } finally { inFlight.current = false; setBusy(false); }
  };
  const exportWorkspace = () => {
    if (!workspace) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'solocanvas-workspace.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return <main>
    <header><strong>Workspace preview</strong><div className="actions">
      <button onClick={close} disabled={busy}>Back to board</button>
      <button onClick={exportWorkspace} disabled={!workspace}>Export workspace</button>
      <button onClick={save} disabled={!workspace || busy}>Save workspace</button>
    </div></header>
    <div className="workspace">
      <section className="canvas" aria-label="Workspace canvas">{view && <ReactFlow nodes={view.nodes} edges={view.edges} nodesDraggable={false} nodesConnectable={false} elementsSelectable onNodeClick={(_, node) => setSelectedNode(node.id)} fitView><Background /><Controls /></ReactFlow>}</section>
      <aside>
        <h1>Boards</h1>
        <p>This preview supports multiple boards and shared names. Moving, connecting, and deleting components are not yet available here.</p>
        {workspace && <>
          <label>Current board<select aria-label="Current board" value={boardId} onChange={event => { setBoardId(event.target.value); setSelectedNode(''); }}>
            {workspace.boards.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
          <div className="workspace-actions"><button onClick={createBoard}>New board</button><button onClick={addComponent} disabled={!board}>Add component</button></div>
          <label>Existing component<select aria-label="Existing component" value={cardId} onChange={event => setCardId(event.target.value)}><option value="">Choose a component</option>{workspace.cards.map(card => <option key={card.id} value={card.id}>{String(card.data.label ?? 'Untitled')}</option>)}</select></label>
          <button onClick={reuse} disabled={!board || !cardId}>Place component</button>
          {selectedCard && <label>Shared component name<input value={String(selectedCard.data.label ?? '')} onChange={event => changed(updateCard(workspace, selectedCard.id, { ...selectedCard.data, label: event.target.value }))} /></label>}
        </>}
        <p role="status">{message}</p>
      </aside>
    </div>
  </main>;
}
