import { useEffect, useRef, useState } from 'react';
import { partitionSelectedFiles, readSelectedSources, selectedFileDetails } from './file-map.mjs';
import { applyMapRefresh, mapRefreshContents, previewMapRefresh, type MapFileChange } from './map-refresh.mjs';
import { applyDependencyRefresh, prepareRefreshAnalysis, previewDependencyRefresh, type DependencyChange } from './refresh-dependencies.mjs';
import { startDependencyAnalysis } from './analysis-client.mjs';
import type { Workspace } from './workspace.mjs';

type Props = {
  workspace: Workspace;
  boardId: string;
  revision: number;
  isCurrent: (revision: number) => boolean;
  onApply: (next: Workspace) => void;
};
type FilePreview = {
  revision: number;
  changes: MapFileChange[];
  contents: Map<string, string>;
  skipped: { path: string; reason: string }[];
};
type LinkPreview = {
  workspace: Workspace;
  changes: DependencyChange[];
  diagnostics: { path: string; reason: string }[];
};
const fileLabels = { added: 'Added', changed: 'Changed', missing: 'Missing', restored: 'Restored', baseline: 'Record file details' };
const linkLabels = { added: 'Added', updated: 'Updated', removed: 'Removed' };
const staleMessage = 'The workspace changed. Preview the folder again to include your latest edits.';

function toggleSelection(current: string[], key: string) {
  return current.includes(key) ? current.filter(item => item !== key) : [...current, key];
}

export default function RefreshCodeMap({ workspace, boardId, revision, isCurrent, onApply }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [readSource, setReadSource] = useState(false);
  const [excludeGenerated, setExcludeGenerated] = useState(true);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [links, setLinks] = useState<LinkPreview | null>(null);
  const [selectedLinks, setSelectedLinks] = useState<string[]>([]);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const operation = useRef(0);
  const analysis = useRef<ReturnType<typeof startDependencyAnalysis> | null>(null);
  useEffect(() => () => {
    operation.current++;
    analysis.current?.cancel();
  }, []);

  function clearReview() {
    operation.current++;
    analysis.current?.cancel();
    analysis.current = null;
    setWorking('');
    setPreview(null);
    setSelectedPaths([]);
    setLinks(null);
    setSelectedLinks([]);
    setError('');
  }

  async function previewFiles() {
    clearReview();
    const ticket = operation.current;
    setWorking('Reading folder…');
    try {
      const { retained } = partitionSelectedFiles(files, excludeGenerated);
      const paths = files.map(file => file.webkitRelativePath);
      const source = readSource && retained.length
        ? await readSelectedSources(retained.map(file => ({ path: file.webkitRelativePath, file })))
        : { contents: new Map<string, string>(), skipped: [] };
      if (operation.current !== ticket) return;
      if (!isCurrent(revision)) throw new Error(staleMessage);
      const changes = previewMapRefresh(workspace, boardId, paths, source.contents, selectedFileDetails(retained), excludeGenerated);
      setPreview({ revision, changes, contents: mapRefreshContents(workspace, boardId, paths, source.contents, excludeGenerated), skipped: source.skipped });
    } catch (cause) {
      if (operation.current === ticket) setError(cause instanceof Error ? cause.message : 'Could not preview the folder.');
    } finally {
      if (operation.current === ticket) setWorking('');
    }
  }

  function filesWithChoices(review: FilePreview) {
    if (!isCurrent(review.revision)) throw new Error(staleMessage);
    return applyMapRefresh(workspace, boardId, review.changes, selectedPaths, () => crypto.randomUUID());
  }

  async function reviewLinks() {
    if (!preview) return;
    const ticket = ++operation.current;
    setError('');
    setWorking('Comparing dependencies…');
    setLinks(null);
    setSelectedLinks([]);
    try {
      const proposed = filesWithChoices(preview);
      const input = prepareRefreshAnalysis(proposed, boardId, preview.contents);
      analysis.current = startDependencyAnalysis(input, boardId);
      const result = await analysis.current.promise;
      if (operation.current !== ticket) return;
      if (!isCurrent(preview.revision)) throw new Error(staleMessage);
      setLinks({ workspace: proposed, changes: previewDependencyRefresh(proposed, boardId, preview.contents, result), diagnostics: result.diagnostics });
    } catch (cause) {
      if (operation.current === ticket) setError(cause instanceof Error ? cause.message : 'Could not compare dependencies.');
    } finally {
      if (operation.current === ticket) { analysis.current = null; setWorking(''); }
    }
  }

  function apply() {
    if (!preview) return;
    try {
      if (!isCurrent(preview.revision)) throw new Error(staleMessage);
      // Reuse the projected placement IDs the worker inspected when applying its evidence.
      let next = links ? links.workspace : filesWithChoices(preview);
      if (links && selectedLinks.length) next = applyDependencyRefresh(next, boardId, links.changes, selectedLinks, () => crypto.randomUUID());
      onApply(next);
      clearReview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not apply these changes.');
    }
  }

  const stale = preview !== null && preview.revision !== revision;
  return <details className="workspace-tool">
    <summary>Refresh code map</summary>
    <section aria-label="Refresh code map">
      <p>Reselect this map’s project folder to compare paths, file sizes and modification times. Missing files keep their placements, notes and connections.</p>
      <label>Refresh folder<input type="file" multiple {...{ webkitdirectory: '' }} aria-label="Refresh folder"
        onChange={event => {
          const picked = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          clearReview();
          setFiles(picked);
          if (!picked.length) setError('The browser supplied no files to identify this folder. Choose a folder containing at least one file.');
        }} /></label>
      {files.length > 0 && <p>{files[0].webkitRelativePath.split('/')[0]} · {files.length} files selected</p>}
      <label><input type="checkbox" checked={excludeGenerated} onChange={event => { clearReview(); setExcludeGenerated(event.target.checked); }} />
        Exclude generated folders</label>
      <label><input type="checkbox" checked={readSource} onChange={event => { clearReview(); setReadSource(event.target.checked); }} />
        Read source text for refresh</label>
      <p>Source text compares supported files and their imports, up to 64 KiB per file and 512 KiB total.</p>
      <button disabled={!files.length || !!working} onClick={previewFiles}>Preview file changes</button>
      {working && <p aria-live="polite">{working}</p>}
      {(error || stale) && <p role="alert">{stale ? staleMessage : error}</p>}
      {preview && !stale && <>
        <h3>File changes</h3>
        {!preview.changes.length && <p>No file changes found.</p>}
        {preview.changes.some(item => item.kind === 'baseline') && <p>Choose “Record file details” to save a file’s size and modification time for future comparisons.</p>}
        {preview.changes.map(item => <label key={item.path}>
          <input type="checkbox" aria-label={fileLabels[item.kind] + ' ' + item.path} disabled={!!working} checked={selectedPaths.includes(item.path)} onChange={() => {
            setSelectedPaths(current => toggleSelection(current, item.path));
            setLinks(null); setSelectedLinks([]); setError('');
          }} /> {fileLabels[item.kind]} {item.path}
        </label>)}
        {preview.skipped.length > 0 && <details><summary>Skipped source text ({preview.skipped.length})</summary>
          <ul>{preview.skipped.map(item => <li key={item.path}>{item.path}: {item.reason}</li>)}</ul>
        </details>}
        {preview.contents.size > 0 && <button disabled={!!working} onClick={reviewLinks}>Review dependency changes</button>}
        {links && <>
          <h3>Dependency changes</h3>
          {!links.changes.length && <p>No dependency changes found for the selected file changes.</p>}
          {links.changes.map(change => {
            const { evidence } = change;
            const label = `${linkLabels[change.kind]} dependency ${evidence.sourcePath} → ${evidence.targetPath}`;
            return <label key={change.key}><input type="checkbox" aria-label={label} checked={selectedLinks.includes(change.key)}
              onChange={() => setSelectedLinks(current => toggleSelection(current, change.key))} /> {label}
              <small> {change.kind === 'removed' ? 'Previous import' : 'Import'}: {evidence.specifier} · line {evidence.line} · {evidence.importKind}</small>
              {change.kind === 'updated' && change.previous && <small> Previous: {change.previous.specifier} · line {change.previous.line} · {change.previous.importKind}</small>}
            </label>;
          })}
          {links.diagnostics.length > 0 && <details><summary>Analysis details ({links.diagnostics.length})</summary>
            <ul>{links.diagnostics.map((item, index) => <li key={index}>{item.path}: {item.reason}</li>)}</ul>
          </details>}
        </>}
        <button disabled={!!working || (!selectedPaths.length && !selectedLinks.length)} onClick={apply}>Apply selected changes</button>
      </>}
      {(working || preview) && <button onClick={clearReview}>Cancel refresh</button>}
    </section>
  </details>;
}
