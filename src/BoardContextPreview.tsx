import { useMemo, useState } from 'react';
import { buildBoardContext } from './spatial-context.mjs';
import { connectedPlacementContext } from './connected-context.mjs';
import type { Workspace } from './workspace.mjs';
import './board-context.css';

type Props = {
  workspace: Workspace;
  boardId: string;
  selectedPlacementId: string | null;
  visible: boolean;
};

function ContextContents({ workspace, boardId, selectedPlacementId, visible }: Props) {
  const [onlyConnected, setOnlyConnected] = useState(false);
  const [includeNoteText, setIncludeNoteText] = useState(false);
  const includeText = includeNoteText && !onlyConnected;
  const canPreview = visible && (!onlyConnected || selectedPlacementId !== null);
  const context = useMemo(() => canPreview ? buildBoardContext(workspace, boardId, { includeNoteText: includeText }) : null,
    [workspace, boardId, includeText, canPreview]);
  const startId = onlyConnected ? selectedPlacementId : null;
  const json = useMemo(() => {
    if (!context) return null;
    const scope = startId !== null ? connectedPlacementContext(context, startId) : context;
    return JSON.stringify(scope, null, 2);
  }, [context, startId]);

  function download() {
    if (json === null) return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'solocanvas-board-context.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!visible) return null;
  return <section aria-label="Board context preview" className="board-context-preview">
    <p>Preview this board’s current layout and relationships, including unsaved edits.</p>
    <label className="board-context-option">
      <input type="checkbox" checked={onlyConnected} disabled={selectedPlacementId === null && !onlyConnected}
        onChange={event => setOnlyConnected(event.target.checked)} />
      Only connected placements
    </label>
    {!onlyConnected && selectedPlacementId === null && <p>Select a component on the canvas to filter by its connections.</p>}
    {!onlyConnected && <label className="board-context-option">
      <input type="checkbox" checked={includeNoteText} onChange={event => setIncludeNoteText(event.target.checked)} />
      Include sticky note text
    </label>}
    {json === null
      ? <p aria-live="polite">Select a component on this board or clear Only connected placements.</p>
      : <label>Board context JSON<textarea readOnly rows={12} spellCheck={false} value={json} /></label>}
    <button type="button" onClick={download} disabled={json === null}>Download context JSON</button>
  </section>;
}

export default function BoardContextPreview(props: Props) {
  const [open, setOpen] = useState(false);
  return <details className="workspace-tool" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Board context</summary>
    <ContextContents key={props.boardId} {...props} visible={open && props.visible} />
  </details>;
}
