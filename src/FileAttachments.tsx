import { useId, useState, type ChangeEvent } from 'react';
import { MAX_FILE_BYTES, type WorkspaceAttachment } from './workspace.mjs';
import './file-attachments.css';

type Props = {
  scope: 'Workspace' | 'Board' | 'Component';
  items?: WorkspaceAttachment[];
  onAttach: (attachment: WorkspaceAttachment) => void;
  onRemove: (id: string) => void;
};

function download(file: WorkspaceAttachment) {
  const bytes = Uint8Array.from(atob(file.base64), value => value.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FileAttachments({ scope, items = [], onAttach, onRemove }: Props) {
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const inputId = useId();

  async function select(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setReading(true);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Choose a file of 256 KiB or less.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const chunks = [];
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
      }
      onAttach({ id: crypto.randomUUID(), name: file.name, size: file.size, base64: btoa(chunks.join('')) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not attach the file.');
    } finally {
      setReading(false);
    }
  }

  return <details className="local-files nodrag nopan nowheel" aria-label={scope + ' files'}
    onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => event.stopPropagation()}>
    <summary>{scope} files ({items.length})</summary>
    <label htmlFor={inputId}>Attach file (up to 256 KiB)</label>
    <input id={inputId} aria-label={'Attach ' + scope.toLowerCase() + ' file'} type="file" disabled={reading} onChange={select} />
    {error && <small role="alert">{error}</small>}
    {items.map(file => <div key={file.id}>
      <button type="button" onClick={() => download(file)} aria-label={'Download ' + file.name}>{file.name}</button>
      <button type="button" onClick={() => onRemove(file.id)} aria-label={'Remove ' + file.name}>Remove</button>
    </div>)}
  </details>;
}
