import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ReactFlow, Background, Controls, type NodeChange, type Connection, type ReactFlowInstance } from '@xyflow/react';
import { addBoard, placeCard, projectBoard, updateCard, renameBoard, removeBoard, findCards, findCardPlacements, type Workspace } from './workspace.mjs';
import { openWorkspace, parseWorkspace, writeWorkspaceLocked, type WorkspaceSnapshot } from './workspace-storage.mjs';

export default function WorkspacePilot({ onClose }: { onClose: (saved: boolean) => void }) {
  const [initial] = useState(() => openWorkspace());
  const [workspace, setWorkspace] = useState<Workspace | null>(initial.ok ? initial.workspace : null);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(initial.ok ? initial.snapshot : null);
  const [boardId, setBoardId] = useState(initial.ok ? initial.workspace.boards[0]?.id ?? '' : '');
  const [cardId, setCardId] = useState('');
  const [search, setSearch] = useState('');
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const [navigation, setNavigation] = useState<{ boardId: string; nodeId: string } | null>(null);
  const [selectedNode, setSelectedNode] = useState('');
  const [selectedEdge, setSelectedEdge] = useState('');
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
  const edge = board?.edges.find(item => item.id === selectedEdge);
  const view = workspace && board ? projectBoard(workspace, board.id) : null;
  const results = workspace ? findCards(workspace, search) : [];
  const appearances = workspace && selectedCard ? findCardPlacements(workspace, selectedCard.id) : [];
  useEffect(() => {
    if (!navigation || !flow || !workspace || navigation.boardId !== boardId) return;
    const target = workspace.boards.find(item => item.id === boardId)?.nodes.find(node => node.id === navigation.nodeId);
    if (target) void flow.setCenter(target.position.x + (target.measured?.width ?? target.width ?? 150) / 2, target.position.y + (target.measured?.height ?? target.height ?? 40) / 2, { zoom: 1 });
    setNavigation(null);
  }, [navigation, flow, workspace, boardId]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const openPlacement = (targetBoardId: string, targetNodeId: string) => {
    setBoardId(targetBoardId); setSelectedNode(targetNodeId); setSelectedEdge('');
    setNavigation({ boardId: targetBoardId, nodeId: targetNodeId });
  };
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
    changed(addBoard(workspace, id, title.trim())); setBoardId(id); setSelectedNode(''); setSelectedEdge('');
  };
  const renameCurrentBoard = () => {
    if (!workspace || !board) return;
    const title = window.prompt('Rename this board', board.title);
    if (title === null || !title.trim() || title.trim() === board.title) return;
    changed(renameBoard(workspace, board.id, title));
  };
  const deleteCurrentBoard = () => {
    if (!workspace || !board || workspace.boards.length <= 1) return;
    if (!window.confirm('Delete this board? Its component placements and relationships will be removed. Shared components remain available. Select Save workspace to make this permanent.')) return;
    const next = removeBoard(workspace, board.id);
    changed(next); setBoardId(next.boards[0].id); setSelectedNode(''); setSelectedEdge('');
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

  const moveNodes = (changes: NodeChange[]) => {
    const positions = changes.filter(change => change.type === 'position' && change.position);
    const dimensions = changes.filter(change => change.type === 'dimensions' && change.dimensions);
    if (!positions.length && !dimensions.length) return;
    if (positions.length) { editVersion.current += 1; setDirty(true); }
    setWorkspace(previous => {
      if (!previous) return previous;
      const next = structuredClone(previous);
      const target = next.boards.find(item => item.id === boardId);
      if (!target) return previous;
      for (const change of positions) {
        if (change.type !== 'position' || !change.position) continue;
        const node = target.nodes.find(item => item.id === change.id);
        if (node) node.position = change.position;
      }
      for (const change of dimensions) {
        if (change.type !== 'dimensions' || !change.dimensions) continue;
        const node = target.nodes.find(item => item.id === change.id);
        if (node) node.measured = { ...change.dimensions };
      }
      return next;
    });
  };
  const connect = (connection: Connection) => {
    if (!workspace || !board || !connection.source || !connection.target) return;
    const next = structuredClone(workspace);
    next.boards.find(item => item.id === board.id)!.edges.push({ ...connection, id: crypto.randomUUID(), source: connection.source, target: connection.target, label: '' });
    changed(next);
  };
  const removeNode = () => {
    if (!workspace || !board || !selectedNode) return;
    const next = structuredClone(workspace);
    const target = next.boards.find(item => item.id === board.id)!;
    target.nodes = target.nodes.filter(node => node.id !== selectedNode);
    target.edges = target.edges.filter(item => item.source !== selectedNode && item.target !== selectedNode);
    changed(next); setSelectedNode('');
  };
  const removeEdge = () => {
    if (!workspace || !board || !selectedEdge) return;
    const next = structuredClone(workspace);
    const target = next.boards.find(item => item.id === board.id)!;
    target.edges = target.edges.filter(item => item.id !== selectedEdge);
    changed(next); setSelectedEdge('');
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

  const importWorkspace = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !snapshot || inFlight.current) return;
    if (file.size > 5 * 1024 * 1024) { setMessage('Import failed: file exceeds 5 MB.'); return; }
    inFlight.current = true; setBusy(true);
    try {
      const imported = parseWorkspace(await file.text());
      if (!imported) { setMessage('Import failed: this is not a valid SoloCanvas workspace.'); return; }
      if (!window.confirm('Replace the workspace currently shown with this file? Export unsaved changes first. Saved data changes only when you select Save workspace.')) return;
      changed(imported); setBoardId(imported.boards[0]?.id ?? ''); setCardId(''); setSelectedNode(''); setSelectedEdge('');
      setMessage('Workspace imported. Select Save workspace to keep it on this device.');
    } catch {
      setMessage('Import failed: the file could not be read.');
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
      <button onClick={exportWorkspace} disabled={!workspace}>Export workspace</button><label className="import-button">Import workspace<input type="file" accept=".json,application/json" aria-label="Import workspace" onChange={importWorkspace} disabled={!snapshot || busy} /></label>
      <button onClick={save} disabled={!workspace || busy}>Save workspace</button>
    </div></header>
    <div className="workspace">
      <section className="canvas" aria-label="Workspace canvas">{view && <ReactFlow onInit={setFlow} nodes={view.nodes.map(node => ({ ...node, selected: node.id === selectedNode }))} edges={view.edges.map(item => ({ ...item, selected: item.id === selectedEdge }))} onNodesChange={moveNodes} onConnect={connect} onNodeClick={(_, node) => { setSelectedNode(node.id); setSelectedEdge(''); }} onEdgeClick={(_, item) => { setSelectedEdge(item.id); setSelectedNode(''); }} onPaneClick={() => { setSelectedNode(''); setSelectedEdge(''); }} fitView><Background /><Controls /></ReactFlow>}</section>
      <aside>
        <h1>Boards</h1>
        <p>Drag components and connect their handles. Select a component or relationship to edit or remove it from this board.</p>
        {workspace && <>
          <label>Current board<select aria-label="Current board" value={boardId} onChange={event => { setBoardId(event.target.value); setSelectedNode(''); setSelectedEdge(''); }}>
            {workspace.boards.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
          <div className="workspace-actions"><button onClick={createBoard}>New board</button><button onClick={renameCurrentBoard} disabled={!board}>Rename board</button><button onClick={deleteCurrentBoard} disabled={!board || workspace.boards.length <= 1}>Delete board</button><button onClick={addComponent} disabled={!board}>Add component</button></div>
          <label>Find components across boards<input value={search} onChange={event => setSearch(event.target.value)} /></label>
          {search.trim() && <section aria-label="Component search results">
            {results.length === 0 && <p>No matching components.</p>}
            {results.map(result => <div key={result.cardId}>
              <strong>{result.label}</strong>
              {result.placements.length === 0 ? <p>Not placed on a board.</p> : <ul>
                {result.placements.map(placement => <li key={JSON.stringify([placement.boardId, placement.nodeId])}>
                  <button onClick={() => openPlacement(placement.boardId, placement.nodeId)}>Open on {placement.boardTitle}</button>
                </li>)}
              </ul>}
            </div>)}
          </section>}
          <label>Existing component<select aria-label="Existing component" value={cardId} onChange={event => setCardId(event.target.value)}><option value="">Choose a component</option>{workspace.cards.map(card => <option key={card.id} value={card.id}>{String(card.data.label ?? 'Untitled')}</option>)}</select></label>
          <button onClick={reuse} disabled={!board || !cardId}>Place component</button>
          {selectedCard && <><label>Shared component name<input value={String(selectedCard.data.label ?? '')} onChange={event => changed(updateCard(workspace, selectedCard.id, { ...selectedCard.data, label: event.target.value }))} /></label><button onClick={removeNode}>Remove component from board</button>
            <section aria-label="Component appearances"><h2>Appears on</h2><ul>{appearances.map(placement => <li key={JSON.stringify([placement.boardId, placement.nodeId])}>
              <button onClick={() => openPlacement(placement.boardId, placement.nodeId)}>Open on {placement.boardTitle}</button>{placement.boardId === boardId && placement.nodeId === selectedNode && ' (current)'}
            </li>)}</ul></section>
          </>}
          {edge && <><label>Relationship label<input value={String(edge.label ?? '')} onChange={event => { const next = structuredClone(workspace); const current = next.boards.find(item => item.id === boardId)?.edges.find(item => item.id === edge.id); if (current) { current.label = event.target.value; changed(next); } }} /></label><button onClick={removeEdge}>Remove relationship</button></>}
        </>}
        <p role="status">{message}</p>
      </aside>
    </div>
  </main>;
}
