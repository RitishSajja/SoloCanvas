import { useState } from 'react';
import { loadBoard, restoreBackupSafely } from './storage.mjs';

export default function LegacyBoardRecovery() {
  const [initial] = useState(() => loadBoard());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (!initial.canRestoreBackup) return null;

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await restoreBackupSafely();
      setMessage(result.message);
      if (result.success) window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return <section className="recovery" aria-label="Legacy board recovery">
    <h2>Previous board backup</h2>
    <p>The saved legacy board is unreadable. A valid previous board backup is available. It will replace the unreadable board only when you choose to restore it.</p>
    <button onClick={restore} disabled={busy}>Restore previous board backup</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
