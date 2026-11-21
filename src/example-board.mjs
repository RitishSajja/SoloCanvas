export function createExampleBoard() {
  const nodes = [
    { id: 'canvas-ui', position: { x: 0, y: 0 }, data: { label: 'Canvas editor' } },
    { id: 'workspace-model', position: { x: 300, y: 0 }, data: { label: 'Workspace model' } },
    { id: 'local-storage', position: { x: 600, y: 0 }, data: { label: 'Local storage' } },
    { id: 'backup-recovery', position: { x: 900, y: 0 }, data: { label: 'Backup & recovery' } },
    { id: 'file-picker', position: { x: 0, y: 240 }, data: { label: 'File picker' } },
    { id: 'import-analysis', position: { x: 300, y: 240 }, data: { label: 'Local analysis worker' } },
    { id: 'review-panel', position: { x: 600, y: 240 }, data: { label: 'Review & apply' } },
    { id: 'diagram-export', position: { x: 300, y: 480 }, data: { label: 'Diagram export' } },
  ];
  const edges = [
    { id: 'canvas-workspace', source: 'canvas-ui', target: 'workspace-model', label: 'edits' },
    { id: 'workspace-storage', source: 'workspace-model', target: 'local-storage', label: 'saves explicitly' },
    { id: 'storage-recovery', source: 'local-storage', target: 'backup-recovery', label: 'keeps recoverable copies' },
    { id: 'picker-analysis', source: 'file-picker', target: 'import-analysis', label: 'selected files only' },
    { id: 'analysis-review', source: 'import-analysis', target: 'review-panel', label: 'suggests relationships' },
    { id: 'review-workspace', source: 'review-panel', target: 'workspace-model', label: 'applies by choice' },
    { id: 'workspace-export', source: 'workspace-model', target: 'diagram-export', label: 'exports' },
  ];
  return { nodes, edges };
}
