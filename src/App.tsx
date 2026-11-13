import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges, type Node, type Edge, type Connection, type NodeChange, type EdgeChange } from '@xyflow/react';

import { loadBoard, restoreBackup, saveBoard } from './storage.mjs';
export default function App() {
  const [initial] = useState(() => loadBoard());
  const savedRaw = useRef<string | null>(initial.raw);
  const [nodes, setNodes] = useState<Node[]>(initial.board.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.board.edges);
  const [canSave, setCanSave] = useState(initial.canSave);
  const [canRestoreBackup, setCanRestoreBackup] = useState(initial.canRestoreBackup);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState(initial.message);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((old) => applyNodeChanges(changes, old));
    if (changes.some((change) => change.type !== 'select' && change.type !== 'dimensions')) setHasUnsavedChanges(true);
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((old) => applyEdgeChanges(changes, old));
    if (changes.some((change) => change.type !== 'select')) setHasUnsavedChanges(true);
  }, []);
  const onConnect = useCallback((connection: Connection) => {
    setEdges((old) => addEdge({ ...connection, label: '' }, old));
    setHasUnsavedChanges(true);
  }, []);
  const save = () => {
    const board = { nodes, edges };
    const result = saveBoard(board, undefined, savedRaw.current);
    setSaveMessage(result);
    if (result === 'Saved on this device') {
      savedRaw.current = JSON.stringify(board);
      setHasUnsavedChanges(false);
    }
  };
  const restore = () => {
    const result = restoreBackup();
    setSaveMessage(result.message);
    if (result.success) {
      savedRaw.current = result.raw ?? null;
      setNodes(result.board.nodes);
      setEdges(result.board.edges);
      setHasUnsavedChanges(false);
      setCanSave(true);
      setCanRestoreBackup(false);
    }
  };
  const exportBoard = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'solocanvas-board.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const addNode = () => {
    const id = crypto.randomUUID();
    setNodes((old) => [...old, { id, position: { x: 60 + old.length * 30, y: 60 + old.length * 30 }, data: { label: 'New component' } }]);
    setHasUnsavedChanges(true);
    setSelected(id);
    setSelectedEdge(null);
  };
  const active = nodes.find((node) => node.id === selected);
  const activeEdge = edges.find((edge) => edge.id === selectedEdge);
  useEffect(() => { if (selected && !active) setSelected(null); }, [selected, active]);
  useEffect(() => { if (selectedEdge && !activeEdge) setSelectedEdge(null); }, [selectedEdge, activeEdge]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);
  return <main>
    <header><div><strong>SoloCanvas</strong><span> Architecture map</span></div><div className="actions"><button onClick={addNode}>Add component</button><button onClick={exportBoard}>Export board</button>{canRestoreBackup && <button onClick={restore}>Restore previous backup</button>}<button onClick={save} disabled={!canSave}>Save board</button></div></header>
    <div className="workspace">
      <section className="canvas" aria-label="Architecture canvas"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => { setSelected(node.id); setSelectedEdge(null); }} onEdgeClick={(_, edge) => { setSelected(null); setSelectedEdge(edge.id); }} onPaneClick={() => { setSelected(null); setSelectedEdge(null); }} fitView><Background /><Controls /></ReactFlow></section>
      <aside><h1>Architecture map</h1><p>Add components, drag them into place, and connect the handles to map relationships.</p>
        {activeEdge ? <label>Relationship label<input aria-label="Relationship label" placeholder="e.g. calls, depends on" value={String(activeEdge.label ?? '')} onChange={(event) => { const label = event.target.value; setEdges((old) => old.map((edge) => edge.id === activeEdge.id ? { ...edge, label } : edge)); setHasUnsavedChanges(true); }} /></label> : active ? <label>Component name<input value={String(active.data.label ?? '')} onChange={(event) => { const label = event.target.value; setNodes((old) => old.map((node) => node.id === active.id ? { ...node, data: { ...node.data, label } } : node)); setHasUnsavedChanges(true); }} /></label> : <p>Select a component or relationship to edit it.</p>}
        <p className="hint">Select a node or connection and press Delete to remove it. Save after making changes.</p><p role="status">{saveMessage}</p>
      </aside>
    </div>
  </main>;
}
