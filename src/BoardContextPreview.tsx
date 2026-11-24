import { useEffect, useMemo, useState } from 'react';
import { buildBoardContext } from './spatial-context.mjs';
import { connectedPlacementContext } from './connected-context.mjs';
import ArchitectureQuestion from './ArchitectureQuestion';
import RegionPicker, { emptyRegion, readRegion } from './RegionPicker';
import type { Workspace } from './workspace.mjs';
import './board-context.css';

type Scope = 'board' | 'connected' | 'region';
type Props = {
  workspace: Workspace;
  boardId: string;
  selectedPlacementId: string | null;
  visible: boolean;
};

function ContextContents({ workspace, boardId, selectedPlacementId, visible }: Props) {
  const [scope, setScope] = useState<Scope>('board');
  const onlyConnected = scope === 'connected';
  const [regionFields, setRegionFields] = useState(emptyRegion);
  const [drawing, setDrawing] = useState(false);
  const region = useMemo(() => readRegion(regionFields), [regionFields]);
  useEffect(() => { if (!visible) setDrawing(false); }, [visible]);
  const [includeNoteText, setIncludeNoteText] = useState(false);
  const includeText = includeNoteText && !onlyConnected;
  const canPreview = visible && (!onlyConnected || selectedPlacementId !== null)
    && (scope !== 'region' || (region !== null && !drawing));
  const context = useMemo(() => canPreview ? buildBoardContext(workspace, boardId, {
    includeNoteText: includeText, region: scope === 'region' && region ? region : undefined,
  }) : null, [workspace, boardId, includeText, canPreview, scope, region]);
  const startId = onlyConnected ? selectedPlacementId : null;
  const json = useMemo(() => {
    if (!context) return null;
    const scope = startId !== null ? connectedPlacementContext(context, startId) : context;
    return JSON.stringify(scope, null, 2);
  }, [context, startId]);

  function changeScope(next: Scope) {
    setDrawing(false);
    setIncludeNoteText(false);
    setScope(next);
  }

  function download() {
    if (json === null) return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'solocanvas-board-context.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section hidden={!visible} aria-label="Board context preview" className="board-context-preview">
    {visible && <>
      <p>Preview this board’s current layout and relationships, including unsaved edits.</p>
      <label className="board-context-option">
        <input type="checkbox" checked={onlyConnected} disabled={selectedPlacementId === null && !onlyConnected}
          onChange={event => changeScope(event.target.checked ? 'connected' : 'board')} />
        Only connected placements
      </label>
      {scope === 'board' && selectedPlacementId === null && <p>Select a component on the canvas to filter by its connections.</p>}
      <label className="board-context-option">
        <input type="checkbox" checked={scope === 'region'}
          onChange={event => changeScope(event.target.checked ? 'region' : 'board')} />
        Rectangular region
      </label>
      {scope === 'region' && <RegionPicker values={regionFields} onChange={setRegionFields}
        drawing={drawing} onDrawingChange={setDrawing} />}
      {!onlyConnected && <label className="board-context-option">
        <input type="checkbox" checked={includeNoteText} onChange={event => setIncludeNoteText(event.target.checked)} />
        Include sticky note text
      </label>}
      {json === null
        ? <p aria-live="polite">{onlyConnected ? 'Select a component on this board or clear Only connected placements.'
          : drawing ? 'Finish drawing to preview the region.' : 'Enter all four bounds with positive width and height, or draw a region.'}</p>
        : <label>Board context JSON<textarea readOnly rows={12} spellCheck={false} value={json} /></label>}
      <button type="button" onClick={download} disabled={json === null}>Download context JSON</button>
    </>}
    <ArchitectureQuestion json={json} visible={visible} />
  </section>;
}

export default function BoardContextPreview(props: Props) {
  const [open, setOpen] = useState(false);
  return <details className="workspace-tool" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Board context</summary>
    <ContextContents key={props.boardId} {...props} visible={open && props.visible} />
  </details>;
}
