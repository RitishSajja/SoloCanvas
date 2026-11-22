import { useLayoutEffect, useRef, useState } from 'react';

type Props = {
  title: string;
  onRename: (name: string) => void;
  onOpen?: () => void;
};

export default function BoardNameEditor({ title, onRename, onOpen }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const rename = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const editing = draft !== null;

  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      rename.current?.focus();
    }
  }, [editing]);

  function finish(apply: boolean, focusButton = false) {
    if (apply && draft?.trim() && draft.trim() !== title) onRename(draft.trim());
    restoreFocus.current = focusButton;
    setDraft(null);
  }

  const Heading = onOpen ? 'h3' : 'h1';
  return <div className="board-name-editor">
    {editing
      ? <input ref={input} aria-label="Board name" className="workspace-inline-name"
          value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => finish(true)}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing || (event.key !== 'Escape' && event.key !== 'Enter')) return;
            event.preventDefault();
            event.stopPropagation();
            finish(event.key === 'Enter', true);
          }} />
      : <>
          <Heading>{onOpen
            ? <button type="button" className="board-open-target" aria-label={`Open board ${title}`}
                onClick={onOpen}>{title}</button>
            : title}</Heading>
          <button type="button" className="board-rename" ref={rename} aria-label="Rename board"
            title={`Rename ${title}`} onClick={() => setDraft(title)}>Rename</button>
        </>}
  </div>;
}
