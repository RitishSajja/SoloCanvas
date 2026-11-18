import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ReactFlow, Background, Controls, type NodeChange, type EdgeChange, type Connection, type ReactFlowInstance } from '@xyflow/react';
import { addBoard, placeCard, projectBoard, updateCard, renameBoard, removeBoard, findCards, findCardPlacements, type Workspace } from './workspace.mjs';
import { openWorkspace, parseWorkspace, writeWorkspaceLocked, type WorkspaceSnapshot } from './workspace-storage.mjs';
import { createFileMap, validateFilePaths, readSelectedSources } from './file-map.mjs';
import type { Suggestion, Diagnostic } from './dependency-map.mjs';
import { startDependencyAnalysis } from './analysis-client.mjs';
import { addSuggestedDependencies } from './dependency-apply.mjs';

const suggestionKey = (item: Suggestion) => JSON.stringify([item.sourceNodeId, item.targetNodeId]);

export default function WorkspacePilot({ onClose }: { onClose: (saved: boolean) => void }) {
  const [initial] = useState(() => openWorkspace());
  const [workspace, setWorkspace] = useState<Workspace | null>(initial.ok ? initial.workspace : null);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(initial.ok ? initial.snapshot : null);
  const [boardId, setBoardId] = useState(initial.ok ? initial.workspace.boards[0]?.id ?? '' : '');
  const [cardId, setCardId] = useState('');
  const [search, setSearch] = useState('');
  const [searchSource, setSearchSource] = useState(false);
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [includeSource, setIncludeSource] = useState(false);
  const [mapReport, setMapReport] = useState<{ path: string; reason: string }[]>([]);
  const [mapError, setMapError] = useState('');
  const [analysis, setAnalysis] = useState<{ boardId: string; version: number; suggestions: Suggestion[]; diagnostics: Diagnostic[] } | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const analysisTask = useRef<ReturnType<typeof startDependencyAnalysis> | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(() => new Set());
  const currentBoardId = useRef(boardId); currentBoardId.current = boardId;
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
  const results = workspace ? findCards(workspace, search, { includeSource: searchSource }) : [];
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
  useEffect(() => () => { analysisTask.current?.cancel(); }, []);

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
  const selectMapFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;
    try {
      setFilePaths(validateFilePaths(files.map(file => file.webkitRelativePath || file.name)));
      setSelectedFiles(files); setIncludeSource(false); setMapReport([]); setMapError('');
    } catch (error) {
      setFilePaths([]); setSelectedFiles([]); setIncludeSource(false); setMapReport([]);
      setMapError(error instanceof Error ? error.message : 'Could not use these files.');
    }
  };
  const addFileMap = async () => {
    if (!workspace || filePaths.length === 0 || inFlight.current) return;
    const title = window.prompt('Name the file map board', 'File map');
    if (title === null || !title.trim()) return;
    const version = editVersion.current;
    inFlight.current = true; setBusy(true);
    try {
      const result = includeSource
        ? await readSelectedSources(selectedFiles.map(file => ({ path: file.webkitRelativePath || file.name, file })))
        : { contents: new Map<string, string>(), skipped: [] };
      if (version !== editVersion.current) {
        setMapError('The workspace changed while reading files. Your edits were kept; create the map again.');
        return;
      }
      const id = crypto.randomUUID();
      const next = createFileMap(workspace, id, title, filePaths, () => crypto.randomUUID(), result.contents);
      changed(next); setBoardId(id); setSelectedNode(''); setSelectedEdge('');
      setFilePaths([]); setSelectedFiles([]); setIncludeSource(false); setMapReport(result.skipped); setMapError('');
      setMessage('File map created. Select Save workspace to keep it on this device.');
    } catch (error) {
      setMapError(error instanceof Error ? error.message : 'Could not create the file map.');
    } finally { inFlight.current = false; setBusy(false); }
  };
  const analyzeImports = async () => {
    if (!workspace || !board || inFlight.current) return;
    const version = editVersion.current;
    const analyzedBoard = board.id;
    inFlight.current = true; setBusy(true); setAnalysis(null); setAnalysisError('');
    let task: ReturnType<typeof startDependencyAnalysis> | null = null;
    try {
      task = startDependencyAnalysis(workspace, analyzedBoard);
      analysisTask.current = task;
      const result = await task.promise;
      if (version !== editVersion.current || currentBoardId.current !== analyzedBoard) {
        setAnalysisError('The workspace or board changed. Analyze again.');
        return;
      }
      setSelectedSuggestions(new Set(result.suggestions.map(suggestionKey)));
      setAnalysis({ boardId: analyzedBoard, version, ...result });
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Could not analyze imports.');
    } finally { if (analysisTask.current === task) analysisTask.current = null; inFlight.current = false; setBusy(false); }
  };
  const applyImports = async () => {
    if (!workspace || !board || !analysis || inFlight.current ||
        analysis.boardId !== board.id || analysis.version !== editVersion.current || selectedSuggestions.size === 0) return;
    inFlight.current = true; setBusy(true); setAnalysisError('');
    try {
      if (analysis.version !== editVersion.current || currentBoardId.current !== board.id) {
        setAnalysisError('The workspace or board changed. Analyze again.'); return;
      }
      const selected = analysis.suggestions.filter(item => selectedSuggestions.has(suggestionKey(item)));
      if (selected.length === 0) return;
      changed(addSuggestedDependencies(workspace, board.id, selected, () => crypto.randomUUID()));
      setAnalysis(null); setMessage('Relationships added. Select Save workspace to keep them.');
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Could not add relationships.');
    } finally { inFlight.current = false; setBusy(false); }
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
    const selections = changes.filter(change => change.type === 'select');
    const chosen = selections.filter(change => change.selected).slice(-1)[0];
    if (chosen) { setSelectedNode(chosen.id); setSelectedEdge(''); }
    else if (selections.some(change => !change.selected && change.id === selectedNode)) setSelectedNode('');
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
  const selectEdges = (changes: EdgeChange[]) => {
    const selections = changes.filter(change => change.type === 'select');
    const chosen = selections.filter(change => change.selected).slice(-1)[0];
    if (chosen) { setSelectedEdge(chosen.id); setSelectedNode(''); }
    else if (selections.some(change => !change.selected && change.id === selectedEdge)) setSelectedEdge('');
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
      <section className="canvas" aria-label="Workspace canvas">{view && <ReactFlow onInit={setFlow} nodes={view.nodes.map(node => ({ ...node, selected: node.id === selectedNode }))} edges={view.edges.map(item => ({ ...item, selected: item.id === selectedEdge }))} onNodesChange={moveNodes} onEdgesChange={selectEdges} onConnect={connect} onNodeClick={(_, node) => { setSelectedNode(node.id); setSelectedEdge(''); }} onEdgeClick={(_, item) => { setSelectedEdge(item.id); setSelectedNode(''); }} onPaneClick={() => { setSelectedNode(''); setSelectedEdge(''); }} fitView><Background /><Controls /></ReactFlow>}</section>
      <aside>
        <h1>Boards</h1>
        <p>Drag components and connect their handles. Select a component or relationship to edit or remove it from this board.</p>
        {workspace && <>
          <label>Current board<select aria-label="Current board" value={boardId} onChange={event => { setBoardId(event.target.value); setSelectedNode(''); setSelectedEdge(''); }}>
            {workspace.boards.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
          <div className="workspace-actions"><button onClick={createBoard}>New board</button><button onClick={renameCurrentBoard} disabled={!board}>Rename board</button><button onClick={deleteCurrentBoard} disabled={!board || workspace.boards.length <= 1}>Delete board</button><button onClick={addComponent} disabled={!board}>Add component</button></div>
          <section aria-label="Create file map">
            <h2>Create file map</h2>
            <p>Choose up to 100 files or a folder. By default only paths are used. Optional source text is saved in your browser and workspace exports; review it for secrets. No relationships are inferred.</p>
            <label>Choose files<input type="file" multiple aria-label="Choose files for map" onChange={selectMapFiles} disabled={busy} /></label>
            <label>Choose folder<input type="file" multiple {...{ webkitdirectory: '' }} aria-label="Choose folder for map" onChange={selectMapFiles} disabled={busy} /></label>
            <label><input type="checkbox" checked={includeSource} onChange={event => setIncludeSource(event.target.checked)} disabled={busy} /> Include source text for JS, TS and Python files (up to 64 KiB each, 512 KiB total)</label>
            {mapError && <p role="alert">{mapError}</p>}
            {mapReport.length > 0 && <section aria-label="Files without source text"><p>These files were added by path only:</p><ul>{mapReport.map(item => <li key={item.path}>{item.path}: {item.reason}</li>)}</ul></section>}
            {filePaths.length > 0 && <><p>{filePaths.length} file(s) selected:</p><ul>{filePaths.map(path => <li key={path}>{path}</li>)}</ul><button onClick={addFileMap} disabled={busy}>Create file map board</button></>}
          </section>
          <section aria-label="Import relationship suggestions">
            <h2>Suggest import relationships</h2>
            <p>Analyze imported JS/TS source on this board for static relative imports and re-exports. Review suggestions before adding them. Non-relative imports, dynamic imports and require calls are reported but not resolved. Python imports are not analyzed.</p>
            <button onClick={analyzeImports} disabled={!board || busy}>Analyze board imports</button>
            {busy && analysisTask.current && <button onClick={() => analysisTask.current?.cancel()}>Cancel import analysis</button>}
            {analysisError && <p role="alert">{analysisError}</p>}
            {analysis && (analysis.boardId !== boardId || analysis.version !== editVersion.current ? <p>Workspace changed. Analyze again before adding relationships.</p> : <>
              <p>{analysis.suggestions.length} relationship(s) suggested.</p>
              <ul>{analysis.suggestions.map(item => <li key={suggestionKey(item)}><label>
                <input type="checkbox" checked={selectedSuggestions.has(suggestionKey(item))} disabled={busy} onChange={event => {
                  const checked = event.target.checked;
                  setSelectedSuggestions(previous => { const next = new Set(previous); if (checked) next.add(suggestionKey(item)); else next.delete(suggestionKey(item)); return next; });
                }} /> {item.sourcePath}:{item.line} imports {item.specifier} → {item.targetPath}
              </label></li>)}</ul>
              {analysis.diagnostics.length > 0 && <><p>Some imports or files could not be resolved:</p><ul>{analysis.diagnostics.map((item, index) => <li key={index}>{item.path}{item.line ? ':' + item.line : ''}{item.specifier ? ' ' + item.specifier : ''}: {item.reason}</li>)}</ul></>}
              <button onClick={applyImports} disabled={busy || selectedSuggestions.size === 0}>Add suggested relationships</button>
            </>)}
          </section>
          <label>Find components across boards<input value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label><input type="checkbox" checked={searchSource} onChange={event => setSearchSource(event.target.checked)} /> Search imported source text</label>
          {search.trim() && <section aria-label="Component search results">
            {results.length === 0 && <p>No matching components.</p>}
            {results.map(result => <div key={result.cardId}>
              <strong>{result.label}</strong>
              {result.placements.length === 0 ? <p>Not placed on a board.</p> : <ul>
                {result.placements.map((placement, index) => <li key={JSON.stringify([placement.boardId, placement.nodeId])}>
                  <button onClick={() => openPlacement(placement.boardId, placement.nodeId)}>Open on {placement.boardTitle} — placement {index + 1}</button>
                </li>)}
              </ul>}
            </div>)}
          </section>}
          <label>Existing component<select aria-label="Existing component" value={cardId} onChange={event => setCardId(event.target.value)}><option value="">Choose a component</option>{workspace.cards.map(card => <option key={card.id} value={card.id}>{String(card.data.label ?? 'Untitled')}</option>)}</select></label>
          <button onClick={reuse} disabled={!board || !cardId}>Place component</button>
          {selectedCard && <><label>Shared component name<input value={String(selectedCard.data.label ?? '')} onChange={event => changed(updateCard(workspace, selectedCard.id, { ...selectedCard.data, label: event.target.value }))} /></label><button onClick={removeNode}>Remove component from board</button>
            {typeof selectedCard.data.sourceText === 'string' && <section aria-label="Imported source text">
              <h2>Imported source text</h2><p>Removing source from this card does not erase older workspace backups or exports.</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selectedCard.data.sourceText}</pre>
              <button onClick={() => { const data = { ...selectedCard.data }; delete data.sourceText; changed(updateCard(workspace, selectedCard.id, data)); }}>Remove source text</button>
            </section>}
            <section aria-label="Component appearances"><h2>Appears on</h2><ul>{appearances.map((placement, index) => <li key={JSON.stringify([placement.boardId, placement.nodeId])}>
              <button aria-current={placement.boardId === boardId && placement.nodeId === selectedNode ? 'location' : undefined} onClick={() => openPlacement(placement.boardId, placement.nodeId)}>Open on {placement.boardTitle} — placement {index + 1}</button>{placement.boardId === boardId && placement.nodeId === selectedNode && ' (current)'}
            </li>)}</ul></section>
          </>}
          {edge && <>{typeof edge.data?.specifier === 'string' && typeof edge.data?.sourcePath === 'string' && <p>Suggested from {String(edge.data.sourcePath)}:{String(edge.data.line)} — {String(edge.data.specifier)} → {String(edge.data.targetPath)}</p>}<label>Relationship label<input value={String(edge.label ?? '')} onChange={event => { const next = structuredClone(workspace); const current = next.boards.find(item => item.id === boardId)?.edges.find(item => item.id === edge.id); if (current) { current.label = event.target.value; changed(next); } }} /></label><button onClick={removeEdge}>Remove relationship</button></>}
        </>}
        <p role="status">{message}</p>
      </aside>
    </div>
  </main>;
}
