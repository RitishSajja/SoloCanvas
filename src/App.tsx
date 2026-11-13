import { useCallback, useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges, type Node, type Edge, type Connection, type NodeChange, type EdgeChange } from '@xyflow/react';

import { loadBoard, saveBoard } from './storage.mjs';
export default function App() {
  const [initial] = useState(() => loadBoard());
  const [nodes, setNodes] = useState<Node[]>(initial.board.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.board.edges);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState(initial.message);
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((old) => applyNodeChanges(changes, old)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((old) => applyEdgeChanges(changes, old)), []);
  const onConnect = useCallback((connection: Connection) => setEdges((old) => addEdge({ ...connection, label: '' }, old)), []);
  const save = () => {
    setSaveMessage(saveBoard({ nodes, edges }));
  };
  const addNode = () => {
    const id = crypto.randomUUID();
    setNodes((old) => [...old, { id, position: { x: 60 + old.length * 30, y: 60 + old.length * 30 }, data: { label: 'New component' } }]);
    setSelected(id);
    setSelectedEdge(null);
  };
  const active = nodes.find((node) => node.id === selected);
  const activeEdge = edges.find((edge) => edge.id === selectedEdge);
  useEffect(() => { if (selected && !active) setSelected(null); }, [selected, active]);
  useEffect(() => { if (selectedEdge && !activeEdge) setSelectedEdge(null); }, [selectedEdge, activeEdge]);
  return <main>
    <header><div><strong>SoloCanvas</strong><span> Architecture map</span></div><div className="actions"><button onClick={addNode}>Add component</button><button onClick={save} disabled={!initial.canSave}>Save board</button></div></header>
    <div className="workspace">
      <section className="canvas" aria-label="Architecture canvas"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => { setSelected(node.id); setSelectedEdge(null); }} onEdgeClick={(_, edge) => { setSelected(null); setSelectedEdge(edge.id); }} onPaneClick={() => { setSelected(null); setSelectedEdge(null); }} fitView><Background /><Controls /></ReactFlow></section>
      <aside><h1>Architecture map</h1><p>Add components, drag them into place, and connect the handles to map relationships.</p>
        {activeEdge ? <label>Relationship label<input aria-label="Relationship label" placeholder="e.g. calls, depends on" value={String(activeEdge.label ?? '')} onChange={(event) => { const label = event.target.value; setEdges((old) => old.map((edge) => edge.id === activeEdge.id ? { ...edge, label } : edge)); }} /></label> : active ? <label>Component name<input value={String(active.data.label ?? '')} onChange={(event) => { const label = event.target.value; setNodes((old) => old.map((node) => node.id === active.id ? { ...node, data: { ...node.data, label } } : node)); }} /></label> : <p>Select a component or relationship to edit it.</p>}
        <p className="hint">Select a node or connection and press Delete to remove it. Save after making changes.</p><p role="status">{saveMessage}</p>
      </aside>
    </div>
  </main>;
}
