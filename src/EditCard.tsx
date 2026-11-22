import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './workspace-interactions.css';

type EditCardProps = {
  label: string;
  fieldLabel: string;
  className: string;
  accessibleName: string;
  onFocus?: () => void;
  onCommit: (value: string) => void;
  onOpen: (value: string) => void;
  children: (title: ReactNode) => ReactNode;
};

// Both board tiles and canvas placements use the same draft/commit semantics.
export default function EditCard({ label, fieldLabel, className, accessibleName, onFocus, onCommit, onOpen, children }: EditCardProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const card = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    }
  }, [editing]);

  // React Flow makes the outer node keyboard-focusable for movement and selection.
  // Forward its Enter gesture to the same editor as a pointer click.
  useLayoutEffect(() => {
    const outer = card.current?.closest<HTMLElement>('.react-flow__node');
    if (!outer) return;
    function activate(event: KeyboardEvent) {
      if (event.target !== outer || event.key !== 'Enter' || event.isComposing || event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) onOpen(label);
      else {
        finished.current = false;
        setDraft(label);
      }
    }
    outer.addEventListener('keydown', activate);
    return () => outer.removeEventListener('keydown', activate);
  }, [label, onOpen]);

  function start() {
    if (editing) return;
    finished.current = false;
    setDraft(label);
  }

  function finish(action: 'apply' | 'cancel' | 'open', restoreFocus: boolean) {
    if (finished.current && editing) return;
    finished.current = true;
    if (action === 'open') onOpen(draft ?? label);
    if (action === 'apply' && draft !== null && draft !== label) onCommit(draft);
    setDraft(null);
    if (restoreFocus) card.current?.focus({ preventScroll: true });
  }

  function cardControl(target: EventTarget) {
    return (target as Element).closest<HTMLElement>('[data-card-control] :is(summary,button,input,label,select,textarea,a[href])');
  }

  return <article ref={card} tabIndex={0} aria-label={accessibleName} aria-keyshortcuts="Control+Enter"
    className={className} onFocus={onFocus}
    onPointerDownCapture={event => {
      // Keep the editor's geometry until the control receives its click. An
      // eager blur can shrink the node underneath the pointer on mouseup.
      if (editing && event.button === 0 && cardControl(event.target)) event.preventDefault();
    }}
    onClickCapture={event => {
      const control = cardControl(event.target);
      if (editing && control) {
        finish('apply', false);
        control.focus({ preventScroll: true });
      }
    }}
    onClick={event => {
      if ((event.target as Element).closest('input,button,select,textarea,a,.react-flow__handle,[data-card-control]')) return;
      start();
    }}
    onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.target !== card.current && event.target !== input.current) return;
      if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        if (event.ctrlKey) finish('open', false);
        else if (editing) finish('apply', true);
        else start();
      } else if (event.key === 'Escape' && editing) {
        event.preventDefault();
        event.stopPropagation();
        finish('cancel', true);
      } else if (editing) {
        // Arrow keys, Backspace and Space belong to the editor while typing.
        event.stopPropagation();
      }
    }}>
    {children(editing ? <input className="workspace-inline-name nodrag nopan nowheel" aria-label={fieldLabel}
      ref={input} value={draft} onChange={event => setDraft(event.target.value)}
      onBlur={() => { if (!finished.current) finish('apply', false); }} /> : label)}
  </article>;
}

