import { useLayoutEffect, useRef, useState } from 'react';

export default function ArchitectureQuestion({ json, visible }: { json: string | null; visible: boolean }) {
  const [question, setQuestion] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLTextAreaElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);
  const copyAttempt = useRef(0);
  const restoreFocus = useRef(false);
  const editing = question !== null;
  const combined = json !== null && question?.trim()
    ? `Question\n${question}\n\nBoard context\n${json}`
    : null;

  useLayoutEffect(() => {
    if (editing) input.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  useLayoutEffect(() => {
    setFeedback('');
    // A pending clipboard write belongs to the exact draft that started it.
    return () => { copyAttempt.current++; };
  }, [combined, visible]);

  async function copy() {
    if (combined === null) return;
    const attempt = ++copyAttempt.current;
    setFeedback('');
    try {
      await navigator.clipboard.writeText(combined);
      if (attempt === copyAttempt.current) setFeedback('Question and context copied.');
    } catch {
      if (attempt !== copyAttempt.current) return;
      setFeedback('Copy manually from Question and context.');
      if (document.activeElement === copyButton.current) {
        preview.current?.focus();
        preview.current?.select();
      }
    }
  }

  if (!visible) return null;
  if (!editing) return <button ref={trigger} type="button" onClick={() => setQuestion('')}>Draft architecture question</button>;
  return <section className="architecture-question" aria-label="Architecture question draft">
    <label>Architecture question<textarea ref={input} rows={3} value={question}
      onChange={event => setQuestion(event.target.value)} /></label>
    {combined !== null && <label>Question and context<textarea ref={preview} rows={8}
      readOnly spellCheck={false} value={combined} /></label>}
    <div className="draft-actions">
      <button ref={copyButton} type="button" disabled={combined === null} onClick={copy}>Copy question and context</button>
      <button type="button" onClick={() => { restoreFocus.current = true; setQuestion(null); }}>Discard draft</button>
    </div>
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
