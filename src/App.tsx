import { useCallback, useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges, type Node, type Edge, type Connection, type NodeChange, type EdgeChange } from '@xyflow/react';

const KEY = 'solocanvas.board.v1';
type Board = { nodes: Node[]; edges: Edge[] };
type BoardLoad = { board: Board; message: string; hasIssue: boolean };
const empty: Board = { nodes: [], edges: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNode(value: unknown): value is Node {
  return isRecord(value) && isRecord(value.position) && isRecord(value.data)
    && typeof value.id === 'string'
    && typeof value.position.x === 'number'
    && typeof value.position.y === 'number'
    && (value.data.label === undefined || typeof value.data.label === 'string');
}

function isEdge(value: unknown): value is Edge {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.source === 'string'
    && typeof value.target === 'string'
    && (value.label === undefined || typeof value.label === 'string');
}

function isBoard(value: unknown): value is Board {
  return isRecord(value)
    && Array.isArray(value.nodes) && value.nodes.every(isNode)
    && Array.isArray(value.edges) && value.edges.every(isEdge);
}

function loadBoard(): BoardLoad {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { board: empty, message: 'Could not access saved board storage; existing data was left untouched.', hasIssue: true };
  }
  if (raw === null) return { board: empty, message: 'No saved board yet', hasIssue: false };
  try {
    const saved: unknown = JSON.parse(raw);
    if (isBoard(saved)) return { board: saved, message: 'Board restored', hasIssue: false };
    return { board: empty, message: 'Saved board has an invalid format; the original was left untouched.', hasIssue: true };
  } catch {
    return { board: empty, message: 'Saved board could not be read; the original was left untouched.', hasIssue: true };
  }
}
export default function App() {
  const [initial] = useState(loadBoard);
  const [nodes, setNodes] = useState<Node[]>(initial.board.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.board.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState(initial.message);
  const [hasStorageIssue, setHasStorageIssue] = useState(initial.hasIssue);
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((old) => applyNodeChanges(changes, old)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((old) => applyEdgeChanges(changes, old)), []);
  const onConnect = useCallback((connection: Connection) => setEdges((old) => addEdge(connection, old)), []);
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ nodes, edges }));
      setHasStorageIssue(false);
      setSaveMessage('Saved on this device');
    } catch {
      setHasStorageIssue(true);
      setSaveMessage('Could not save. Check browser storage permissions.');
    }
  };
  const addNode = () => {
    const id = crypto.randomUUID();
    setNodes((old) => [...old, { id, position: { x: 60 + old.length * 30, y: 60 + old.length * 30 }, data: { label: 'New component' } }]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  };
  const activeNode = nodes.find((node) => node.id === selectedNodeId);
  const activeEdge = edges.find((edge) => edge.id === selectedEdgeId);
  useEffect(() => { if (selectedNodeId && !activeNode) setSelectedNodeId(null); }, [selectedNodeId, activeNode]);
  useEffect(() => { if (selectedEdgeId && !activeEdge) setSelectedEdgeId(null); }, [selectedEdgeId, activeEdge]);
  return <main>
    <header><div><strong>SoloCanvas</strong><span> Architecture map</span></div><div className="actions"><button onClick={addNode}>Add component</button><button onClick={save}>Save board</button></div></header>
    <div className="workspace">
      <section className="canvas" aria-label="Architecture canvas"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }} onEdgeClick={(_, edge) => { setSelectedNodeId(null); setSelectedEdgeId(edge.id); }} onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }} fitView><Background /><Controls /></ReactFlow></section>
      <aside><h1>Architecture map</h1><p>Add components, drag them into place, and connect the handles to map relationships.</p>
        {activeNode ? <label htmlFor="component-name">Component name<input id="component-name" value={String(activeNode.data.label ?? '')} onChange={(event) => { const label = event.target.value; setNodes((old) => old.map((node) => node.id === activeNode.id ? { ...node, data: { ...node.data, label } } : node)); }} /></label>
          : activeEdge ? <label htmlFor="relationship-label">Relationship label<input id="relationship-label" value={String(activeEdge.label ?? '')} placeholder="e.g. calls" onChange={(event) => { const label = event.target.value; setEdges((old) => old.map((edge) => edge.id === activeEdge.id ? { ...edge, label } : edge)); }} /></label>
            : <p>Select a component or connection to edit it.</p>}
        <p className="hint">Select a node or connection and press Delete to remove it. Save after making changes.</p><p role={hasStorageIssue ? 'alert' : 'status'}>{saveMessage}</p>
      </aside>
    </div>
  </main>;
}
