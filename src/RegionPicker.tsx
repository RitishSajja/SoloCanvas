import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, useStore, ViewportPortal } from '@xyflow/react';
import { isContextRegion, type ContextRegion } from './spatial-context.mjs';

const fields = ['x', 'y', 'width', 'height'] as const;
const labels = { x: 'Region X', y: 'Region Y', width: 'Region width', height: 'Region height' };
type RegionFields = Record<keyof ContextRegion, string>;
export const emptyRegion: RegionFields = { x: '', y: '', width: '', height: '' };

export function readRegion(fields: RegionFields): ContextRegion | null {
  if (Object.values(fields).some(value => value.trim() === '')) return null;
  const region = { x: Number(fields.x), y: Number(fields.y), width: Number(fields.width), height: Number(fields.height) };
  return isContextRegion(region) ? region : null;
}

type Point = { x: number; y: number };

function between(start: Point, end: Point): ContextRegion {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) };
}

function RegionOutline({ region }: { region: ContextRegion | null }) {
  if (!region) return null;
  return <ViewportPortal><div aria-hidden="true" className="context-region-outline"
    style={{ left: region.x, top: region.y, width: region.width, height: region.height }} /></ViewportPortal>;
}

function DrawSurface({ onFinish }: { onFinish: (region: ContextRegion | null) => void }) {
  const root = useStore(state => state.domNode);
  const { screenToFlowPosition } = useReactFlow();
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; start: Point } | null>(null);
  const [bounds, setBounds] = useState<ContextRegion | null>(null);

  useLayoutEffect(() => { surface.current?.focus({ preventScroll: true }); }, [root]);

  function point(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return screenToFlowPosition({
      x: Math.max(box.left, Math.min(box.right, event.clientX)),
      y: Math.max(box.top, Math.min(box.bottom, event.clientY)),
    });
  }

  if (!root) return null;
  return <>
    <RegionOutline region={bounds} />
    {createPortal(<div className="context-region-draw" ref={surface} tabIndex={-1} role="group"
      aria-label="Draw a rectangular region" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onFinish(null); }
      }}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary || (event.target as Element).closest('button')) return;
        event.preventDefault();
        drag.current = { id: event.pointerId, start: point(event) };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (drag.current?.id === event.pointerId) setBounds(between(drag.current.start, point(event)));
      }}
      onPointerUp={event => {
        if (drag.current?.id !== event.pointerId) return;
        const region = between(drag.current.start, point(event));
        drag.current = null;
        if (isContextRegion(region)) onFinish(region);
        else setBounds(null);
      }}
      onPointerCancel={() => onFinish(null)}
      onLostPointerCapture={() => { if (drag.current) onFinish(null); }}>
      <div className="context-region-hint"><span>Drag across the board to select a region.</span>
        <button type="button" onClick={() => onFinish(null)}>Cancel drawing</button>
      </div>
    </div>, root)}
  </>;
}

export default function RegionPicker({ values, onChange, drawing, onDrawingChange }: {
  values: RegionFields;
  onChange: (fields: RegionFields) => void;
  drawing: boolean;
  onDrawingChange: (drawing: boolean) => void;
}) {
  const drawButton = useRef<HTMLButtonElement>(null);
  function finish(region: ContextRegion | null) {
    if (region) onChange({ x: String(region.x), y: String(region.y), width: String(region.width), height: String(region.height) });
    onDrawingChange(false);
    requestAnimationFrame(() => drawButton.current?.focus({ preventScroll: true }));
  }
  return <fieldset className="context-region-picker">
    <legend>Region bounds</legend>
    <p>Draw on the canvas or enter the top-left position and size in board units. Items partly inside are included.</p>
    <div className="context-region-fields">
      {fields.map(field => <label key={field}>{labels[field]}
        <input type="number" step="any" value={values[field]} disabled={drawing}
          onChange={event => onChange({ ...values, [field]: event.target.value })} />
      </label>)}
    </div>
    <button type="button" ref={drawButton} disabled={drawing} onClick={() => onDrawingChange(true)}>Draw region on canvas</button>
    {drawing ? <DrawSurface onFinish={finish} /> : <RegionOutline region={readRegion(values)} />}
  </fieldset>;
}
