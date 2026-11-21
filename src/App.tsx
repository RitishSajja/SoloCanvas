import { useState } from 'react';
import LegacyBoardEditor from './LegacyBoardEditor';
import Onboarding from './Onboarding';
import WorkspacePilot from './WorkspacePilot';
import { completeOnboarding, getFirstRunStatus, loadBoard } from './storage.mjs';
import { createExampleBoard } from './example-board.mjs';
import { migrateLegacyBoard, type Workspace } from './workspace.mjs';

export default function App() {
  const legacyBoardRoute = new URLSearchParams(window.location.search).get('legacy-board') === '1';
  const [initial] = useState(() => loadBoard());
  const [showOnboarding, setShowOnboarding] = useState(initial.firstRun);
  const [notice, setNotice] = useState('');
  const [sampleWorkspace, setSampleWorkspace] = useState<Workspace | null>(null);

  if (legacyBoardRoute) return <LegacyBoardEditor />;

  const exploreSample = () => {
    const status = getFirstRunStatus();
    if (status !== 'first-run') {
      setNotice(status === 'unavailable'
        ? 'Browser storage is unavailable. Restore access and reload to continue safely.'
        : status === 'existing-data'
          ? 'Saved work appeared in another tab. Reload to open it safely.'
          : 'Onboarding changed in another tab. Reload to continue safely.');
      return;
    }

    let workspace: Workspace;
    try {
      workspace = migrateLegacyBoard(JSON.stringify(createExampleBoard()), { title: 'Example architecture' });
    } catch {
      setNotice('The sample board could not be loaded safely. Your saved work was not changed.');
      return;
    }

    const result = completeOnboarding();
    if (result !== 'saved' && result !== 'unavailable') {
      setNotice('Saved work appeared in another tab. Reload to open it safely.');
      return;
    }
    setSampleWorkspace(workspace);
    setShowOnboarding(false);
  };

  const startBlank = () => {
    const result = completeOnboarding();
    if (result === 'existing-data') {
      setNotice('Saved work appeared in another tab. Reload to open it safely.');
      return;
    }
    setShowOnboarding(false);
  };

  if (showOnboarding) return <Onboarding notice={notice} onExploreExample={exploreSample} onStartBlank={startBlank} />;
  return <WorkspacePilot
    initialWorkspace={sampleWorkspace}
    initialMessage={sampleWorkspace ? 'Example board loaded. Select Save workspace to keep it on this device.' : undefined}
  />;
}
