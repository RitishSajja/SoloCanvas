type OnboardingProps = {
  notice: string;
  onExploreExample: () => void;
  onStartBlank: () => void;
};

export default function Onboarding({ notice, onExploreExample, onStartBlank }: OnboardingProps) {
  return <main className="welcome-shell">
    <section className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-copy">
        <p className="welcome-eyebrow">SOLOCANVAS <span>·</span> YOUR LOCAL WORKSPACE</p>
        <h1 id="welcome-title">Your canvas starts with you.</h1>
        <p className="welcome-lede">Map the systems you are building, connect the pieces, and keep your work on this device.</p>
        <ul className="welcome-promises">
          <li><span aria-hidden="true">01</span> Your boards stay in this browser</li>
          <li><span aria-hidden="true">02</span> Nothing is saved until you choose</li>
          <li><span aria-hidden="true">03</span> Existing work is never replaced</li>
        </ul>
        <div className="welcome-actions">
          <button className="welcome-primary" onClick={onExploreExample}>Explore the sample board</button>
          <button className="welcome-secondary" onClick={onStartBlank}>Start with a blank canvas</button>
        </div>
        <p className="welcome-note">The sample is optional and stays in memory until you save it.</p>
        {notice && <p className="welcome-notice" role="status">{notice}</p>}
      </div>
      <div className="welcome-art" aria-hidden="true">
        <div className="welcome-art-label">A SYSTEM, AT A GLANCE</div>
        <div className="mini-flow">
          <svg viewBox="0 0 360 200" preserveAspectRatio="none">
            <path d="M112 48H124M236 48H248M180 72V136" />
            <circle cx="118" cy="48" r="3" /><circle cx="242" cy="48" r="3" /><circle cx="180" cy="104" r="3" />
          </svg>
          <div className="mini-node mini-node-canvas"><span />Canvas editor</div>
          <div className="mini-node mini-node-workspace"><span />Workspace</div>
          <div className="mini-node mini-node-storage"><span />Local storage</div>
          <div className="mini-node mini-node-analysis"><span />File analysis</div>
        </div>
        <div className="welcome-art-caption">Connect ideas. Keep control.</div>
      </div>
    </section>
  </main>;
}
