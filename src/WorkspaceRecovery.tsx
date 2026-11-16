import { useState } from 'react';
import { WORKSPACE_KEY, WORKSPACE_BACKUP_KEY, WORKSPACE_DAMAGED_KEY, inspectWorkspaceRecovery, restoreWorkspaceBackup, type RecoverySnapshot } from './workspace-storage.mjs';

type Inventory = { primary: boolean; backup: boolean; damaged: boolean; error?: string; recovery?: RecoverySnapshot; reason?: string };
function inspect(): Inventory {
  try {
    const primary = localStorage.getItem(WORKSPACE_KEY) !== null;
    const backup = localStorage.getItem(WORKSPACE_BACKUP_KEY) !== null;
    const damaged = localStorage.getItem(WORKSPACE_DAMAGED_KEY) !== null;
    if (!primary && !backup && !damaged) return { primary, backup, damaged };
    const result = inspectWorkspaceRecovery();
    return result.ok
      ? { primary, backup, damaged, recovery: result.snapshot }
      : { primary, backup, damaged, reason: result.error };
  } catch {
    return { primary: false, backup: false, damaged: false, error: 'Workspace storage could not be read.' };
  }
}
export default function WorkspaceRecovery() {
  const [inventory, setInventory] = useState(inspect);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const download = (key: string, name: string) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) { setMessage('That copy no longer exists. Refresh the list.'); return; }
      const url = URL.createObjectURL(new Blob([raw], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = name; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage('Download started. Keep the file somewhere safe.');
    } catch { setMessage('The copy could not be read for download.'); }
  };
  const restore = async () => {
    if (!inventory.recovery || busy) return;
    if (!window.confirm('Restore the workspace backup? The damaged workspace will be preserved in this browser. Download copies first if needed.')) return;
    setBusy(true);
    try {
      const result = await restoreWorkspaceBackup(inventory.recovery);
      setMessage(result.ok ? 'Backup restored. This editor cannot open the newer workspace yet; download a copy for safekeeping.' : result.error);
      setInventory(inspect());
    } finally { setBusy(false); }
  };
  return <details className="recovery">
    <summary>Workspace recovery</summary>
    <p>Download raw workspace copies or restore a damaged workspace from its backup. This editor cannot open newer workspaces yet.</p>
    {inventory.error && <p>{inventory.error}</p>}
    {!inventory.error && !inventory.primary && !inventory.backup && !inventory.damaged && <p>No workspace copies found in this browser.</p>}
    <div className="recovery-actions">
      {inventory.primary && <button onClick={() => download(WORKSPACE_KEY, 'solocanvas-workspace-current.txt')}>Download workspace data</button>}
      {inventory.backup && <button onClick={() => download(WORKSPACE_BACKUP_KEY, 'solocanvas-workspace-backup.txt')}>Download workspace backup</button>}
      {inventory.damaged && <button onClick={() => download(WORKSPACE_DAMAGED_KEY, 'solocanvas-workspace-damaged.txt')}>Download preserved damaged data</button>}
      {inventory.recovery && <button onClick={restore} disabled={busy}>Restore workspace backup</button>}
      <button onClick={() => { setInventory(inspect()); setMessage(''); }}>Refresh workspace copies</button>
    </div>
    {inventory.reason && <p className="hint">{inventory.reason}</p>}
    <p aria-live="polite">{message}</p>
  </details>;
}
