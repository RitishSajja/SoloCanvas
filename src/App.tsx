import WorkspacePilot from './WorkspacePilot';
import LegacyBoardEditor from './LegacyBoardEditor';

export default function App() {
  const legacyBoardRoute = new URLSearchParams(window.location.search).get('legacy-board') === '1';
  return legacyBoardRoute ? <LegacyBoardEditor /> : <WorkspacePilot />;
}
