import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges, type Node, type Edge, type Connection, type NodeChange, type EdgeChange } from '@xyflow/react';

import WorkspaceRecovery from './WorkspaceRecovery';
import WorkspacePilot from './WorkspacePilot';
import { loadBoard, parseBoard, restoreBackupSafely, saveBoardSafely } from './storage.mjs';
export default function App() {
  const [initial] = useState(() => loadBoard());
  const [showWorkspace, setShowWorkspace] = useState(false);
  const savedRaw = useRef<string | null>(initial.raw);
  const [nodes, setNodes] = useState<Node[]>(() => initial.board.nodes.map((node) => ({ ...node, selected: false })));
  const [edges, setEdges] = useState<Edge[]>(() => initial.board.edges.map((edge) => ({ ...edge, selected: false })));
  const [canSave, setCanSave] = useState(initial.canSave);
  const [canRestoreBackup, setCanRestoreBackup] = useState(initial.canRestoreBackup);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState(initial.message);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const operationInProgress = useRef(false);
  const editVersion = useRef(0);
  const markChanged = useCallback(() => { editVersion.current += 1; setHasUnsavedChanges(true); }, []);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((old) => applyNodeChanges(changes, old));
    if (changes.some((change) => change.type !== 'select' && change.type !== 'dimensions')) markChanged();
  }, [markChanged]);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((old) => applyEdgeChanges(changes, old));
    if (changes.some((change) => change.type !== 'select')) markChanged();
  }, [markChanged]);
  const onConnect = useCallback((connection: Connection) => {
    setEdges((old) => addEdge({ ...connection, label: '' }, old));
    markChanged();
  }, [markChanged]);
  const save = async () => {
    if (operationInProgress.current) return;
    operationInProgress.current = true; setSaving(true);
    const board = { nodes, edges };
    const version = editVersion.current;
    try {
      const result = await saveBoardSafely(board, undefined, savedRaw.current);
      if (result === 'Saved on this device') {
        savedRaw.current = JSON.stringify(board);
        if (version === editVersion.current) {
          setHasUnsavedChanges(false); setSaveMessage(result);
        } else setSaveMessage('Saved an earlier version. Newer edits are not saved.');
      } else setSaveMessage(result);
    } finally { operationInProgress.current = false; setSaving(false); }
  };
  const restore = async () => {
    if (operationInProgress.current) return;
    if (hasUnsavedChanges && !window.confirm('Restore the saved backup? Export unsaved changes first if you want to keep them.')) return;
    operationInProgress.current = true; setSaving(true);
    const version = editVersion.current;
    try {
      const result = await restoreBackupSafely();
      setSaveMessage(result.message);
      if (result.success) {
        savedRaw.current = result.raw;
        if (version === editVersion.current) {
          setNodes(result.board.nodes.map((node) => ({ ...node, selected: false })));
          setEdges(result.board.edges.map((edge) => ({ ...edge, selected: false })));
          setHasUnsavedChanges(false);
        } else setSaveMessage('Backup restored. Newer edits remain unsaved.');
        setCanSave(true);
        setCanRestoreBackup(false);
      }
    } finally { operationInProgress.current = false; setSaving(false); }
  };
  const exportBoard = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'solocanvas-board.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const importBoard = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setSaveMessage('Import failed: file exceeds 5 MB.'); return; }
    try {
      const board = parseBoard(await file.text());
      if (!board) { setSaveMessage('Import failed: this is not a valid SoloCanvas board.'); return; }
      if (!window.confirm('Replace the current canvas with this file? Your saved board will not change until you choose Save board. Export any unsaved work first.')) return;
      setNodes(board.nodes);
      setEdges(board.edges);
      setSelected(null);
      setSelectedEdge(null);
      markChanged();
      setSaveMessage('Board imported. Select Save board to keep it on this device.');
    } catch {
      setSaveMessage('Import failed: the file could not be read.');
    }
  };
  const addNode = () => {
    const id = crypto.randomUUID();
    setNodes((old) => [...old, { id, position: { x: 60 + old.length * 30, y: 60 + old.length * 30 }, data: { label: 'New component' } }]);
    markChanged();
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
  if (showWorkspace) return <WorkspacePilot onClose={(saved) => { setShowWorkspace(false); if (saved) { setCanSave(false); setSaveMessage('A newer workspace exists. Export this older board if needed.'); } }} />;
  return <main>
    <header><div><strong>SoloCanvas</strong><span> Architecture map</span></div><div className="actions"><button onClick={addNode}>Add component</button><button onClick={() => { if (!hasUnsavedChanges || window.confirm('Workspace preview uses the last saved board. Unsaved edits will stay here but will not appear in the preview. Continue?')) setShowWorkspace(true); }}>Open workspace</button><button onClick={exportBoard}>Export board</button><label className="import-button">Import board<input type="file" accept=".json,application/json" onChange={importBoard} /></label>{canRestoreBackup && <button onClick={restore} disabled={saving}>Restore previous backup</button>}<button onClick={save} disabled={!canSave || saving}>Save board</button></div></header>
    <div className="workspace">
      <section className="canvas" aria-label="Architecture canvas"><ReactFlow deleteKeyCode={['Backspace', 'Delete']} nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => { setSelected(node.id); setSelectedEdge(null); }} onEdgeClick={(_, edge) => { setSelected(null); setSelectedEdge(edge.id); }} onPaneClick={() => { setSelected(null); setSelectedEdge(null); }} fitView><Background /><Controls /></ReactFlow></section>
      <aside><h1>Architecture map</h1><p>Add components, drag them into place, and connect the handles to map relationships.</p>
        {activeEdge ? <label>Relationship label<input aria-label="Relationship label" placeholder="e.g. calls, depends on" value={String(activeEdge.label ?? '')} onChange={(event) => { const label = event.target.value; setEdges((old) => old.map((edge) => edge.id === activeEdge.id ? { ...edge, label } : edge)); markChanged(); }} /></label> : active ? <label>Component name<input value={String(active.data.label ?? '')} onChange={(event) => { const label = event.target.value; setNodes((old) => old.map((node) => node.id === active.id ? { ...node, data: { ...node.data, label } } : node)); markChanged(); }} /></label> : <p>Select a component or relationship to edit it.</p>}
        <p className="hint">Select a node or connection and press Delete to remove it. Save after making changes.</p><p role="status">{saveMessage}</p><WorkspaceRecovery />
      </aside>
    </div>
  </main>;
}
