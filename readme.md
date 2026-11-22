# SoloCanvas: Local-First Spatial Workspace Prototype

**SoloCanvas** is a browser-local Vite/React prototype for organizing project boards, connected components, notes, and nested placement-specific mini-boards. It currently has no AI features, cloud sync, or remote publishing. The product and architecture sections below describe longer-term direction; **Current Application** documents what is implemented.

This project reimagines the infinite canvas ([Salesdorado Miro Review](https://salesdorado.com/en/automation/project-management-software/review-miro/)) as a fast, local-first "daily desk" where a single user can organize tasks, synthesize research, wire up Retrieval-Augmented Generation (RAG) and AI agent workflows, and publish polished client or portfolio views without enterprise overhead ([tldraw Creative Design Use Cases](https://tldraw.dev/use-cases/creative-design), [Atlas Visual Research Alternatives](https://www.atlasworkspace.ai/blog/heptabase-alternatives)).

## 1. Market Baseline & Competitive Landscape

Understanding where enterprise whiteboards over-index on team governance—and where existing personal note-taking canvases stop short of active workflow execution—defines the product gap for **SoloCanvas** ([IdeaTakeoff Miro Review](https://ideatakeoff.com/miro-review/), [Fabric Heptabase vs. Obsidian Comparison](https://fabric.so/comparison/heptabase-vs-obsidian)).

| Platform | Primary Focus | Core Strengths | Solo Workflow Friction | Pricing Baseline |
| :--- | :--- | :--- | :--- | :--- |
| [Miro](https://miro.com/) | Enterprise visual collaboration & AI Innovation Workspace ([Miro Platform Overview](https://miro.com/products/platform-overview/)) | 4,700+ diagramming shapes, **Docs**, **Tables**, **Slides**, **AI Sidekicks**, **Flows**, and **MCP Server** ([Miro Pricing](https://miro.com/pricing/)) | Free tier locks boards past 3 active boards to view-only and caps AI at 10 shared credits/month; heavy team facilitation UI ([Carly AI Miro Pricing Breakdown](https://www.usecarly.com/blog/miro-pricing/)) | Free (3 boards); Starter $8/member/mo annual ($10 monthly); Business $20/member/mo annual ($25 monthly) ([Miro Pricing](https://miro.com/pricing/)) |
| [Heptabase](https://heptabase.com/) | Visual research & PDF-to-card synthesis ([Heptabase Homepage](https://heptabase.com/)) | Deep PDF annotation, reusable atomic cards across whiteboards, daily journals, and built-in AI Tutor ([Fabric Heptabase vs. Obsidian Comparison](https://fabric.so/comparison/heptabase-vs-obsidian)) | Closed ecosystem with no plugin API, no permanent free tier (7-day trial only), and focused on study over job execution ([ToolGuide Heptabase Review](https://toolguide.io/en/tool/heptabase/)) | Pro $8.99/mo annual ($11.99 monthly); Premium $17.99/mo annual ([Fabric Heptabase vs. Obsidian Comparison](https://fabric.so/comparison/heptabase-vs-obsidian)) |
| [Obsidian Canvas](https://obsidian.md/canvas) | Local Markdown vault with spatial board view ([Obsidian Canvas](https://obsidian.md/canvas)) | Plain-text local file ownership, open JSON Canvas format, and 2,500+ community plugins ([Storyflow Heptabase vs. Obsidian](https://storyflow.so/blog/heptabase-vs-obsidian-for-visual-thinking)) | Canvas is secondary to text files; requires 5 to 10 hours of manual plugin configuration and lacks native spatial AI ([Fabric Heptabase vs. Obsidian Comparison](https://fabric.so/comparison/heptabase-vs-obsidian)) | Free for personal use; Sync ~$4–$5/mo; Commercial $50/user/yr ([Fabric Heptabase vs. Obsidian Comparison](https://fabric.so/comparison/heptabase-vs-obsidian)) |
| [Scrintal](https://scrintal.com/features/visually-organize) | Card-based visual knowledge management ([Scrintal Features](https://scrintal.com/features/visually-organize)) | Clean web-based card linking, citation-friendly boards, and GDPR-compliant export ([Medium Visual Modelling Analysis](https://medium.com/@davidroliver/visual-modelling-with-heptabase-scrintal-4c0cadf83377)) | Web-first architecture with lighter developer/automation extensibility than programmable canvas SDKs ([OmniCanvas Scrintal Alternatives](https://omnicanvasnotes.com/blog/reviews/scrintal-alternatives)) | Paid plans starting from $9/mo ([OmniCanvas Heptabase Alternatives](https://omnicanvasnotes.com/blog/reviews/heptabase-alternatives)) |

## 2. Core Product Shifts: From Team Whiteboard to Solo Daily Driver

To make an infinite canvas indispensable for an individual's day-to-day job, the architecture replaces multi-user workshop mechanics with five single-player primitives:

* **Persistent "Daily Desk" Viewport:** Instead of launching into a blank whiteboard chooser, the default viewport opens to a structured spatial desk anchoring today's schedule, active task cards, and pinned reference frames ([Fabric Heptabase vs. Obsidian Comparison](https://fabric.so/comparison/heptabase-vs-obsidian)).
* **Reusable Atomic Cards over Ephemeral Stickies:** Every note, task, code block, or PDF excerpt placed on a board is stored as a canonical database entity with bidirectional backlinks, so editing an item on a daily scratchpad automatically updates it inside long-term project boards ([Medium Visual Modelling Analysis](https://medium.com/@davidroliver/visual-modelling-with-heptabase-scrintal-4c0cadf83377), [Atlas Visual Research Alternatives](https://www.atlasworkspace.ai/blog/heptabase-alternatives)).
* **Hierarchical Project Workspace:** A project's opening view should act as a workspace for organizing areas such as tasks or teams. Components should be openable into focused mini-boards, with further openable components allowing nested chains. The resulting boards should bring architecture components and sticky-note observations together, with selectable component shapes rather than a single default silhouette.
* **Local-First Zero-Latency Storage:** Board state lives locally in the user's browser or desktop shell via [SQLite WASM](https://sqlite.org/wasm) and [Yjs](https://yjs.dev/) conflict-free replicated data types (CRDTs), guaranteeing instant offline load times and near-zero server hosting costs for free-tier users ([GitHub Yjs-SQLite Project](https://github.com/samwillis/yjs-sqlite-test)).
* **Spatial RAG & Visual Agent Chaining:** Users can lasso any cluster of cards on the canvas—or connect nodes with directed edges—to pass spatial context directly into an LLM agent pipeline or an external tool via the **Model Context Protocol (MCP)** ([tldraw Creative Design Use Cases](https://tldraw.dev/use-cases/creative-design), [Miro Platform Overview](https://miro.com/products/platform-overview/)).
* **One-Click Read-Only Publishing:** While editing is strictly optimized for one person, any frame on the canvas can be published as a clean, interactive web link or exported deck for clients, managers, or audiences ([Miro Pricing](https://miro.com/pricing/), [Salesdorado Miro Review](https://salesdorado.com/en/automation/project-management-software/review-miro/)).

## 3. System Architecture

The application is designed around afour-layer architecture that decouples high-frequency 60–120 FPS canvas rendering from local relational/CRDT storage and asynchronous AI execution.

```text
+-----------------------------------------------------------------------------------+
|                           PRESENTATION & CANVAS LAYER                             |
|  React 19 + TypeScript  |  Canvas Engine (tldraw SDK / React Flow / PixiJS WebGPU)|
|  Custom Card Shapes: Markdown Note | Task Widget | PDF Excerpt | Code / SQL Node  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                         LOCAL-FIRST STATE & SYNC LAYER                            |
|  In-Memory State: Yjs Shared Types (Y.Map / Y.Array) + UndoManager                |
|  Local Persistence: SQLite WASM (OPFS) + IndexedDB  |  Export: JSON Canvas (.canvas)|
|  Optional Cloud Sync: WebSocket CRDT Relay + S3/R2 Encrypted Blob Storage         |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        SPATIAL AI & ORCHESTRATION LAYER                           |
|  Spatial Context Compiler (Bounding-Box & Connected-Subgraph Serializer)          |
|  Local Vector Index (SQLite / WebGPU Embeddings) + LangGraph Agent Runtime        |
|  Model Context Protocol (MCP) Client/Server Bridge (GitHub, Slack, Local Files)   |
+-----------------------------------------------------------------------------------+
```

### Layer 1: Presentation & Spatial Rendering Engine

* **Scene Graph & Viewport Management:** Handles pan/zoom affine transformations, camera frustum culling (rendering only nodes inside the visible viewport), spatial indexing (R-tree hit testing), and snapping connectors ([PixiJS Architecture Guide](https://pixijs.download/dev/docs/core-concepts.html), [tldraw SDK](https://tldraw.dev/)).
* **DOM vs. WebGPU Hybrid Rendering:** Interactive rich-text editors, code blocks, and embedded iframes render as hardware-accelerated HTML DOM overlays when zoomed in, while thousands of distant cards collapse into lightweight WebGL/WebGPU textures during semantic zoom-out ([PixiJS June 2026 Update](https://pixijs.com/blog/june-2026), [Storyflow Thinking Canvas Analysis](https://storyflow.so/blog/best-thinking-canvas-tools-2026)).

### Layer 2: Local-First Persistence & Data Model

* **Transacted CRDT State:** Every canvas mutation (moving a card, typing inside a note, drawing an arrow) updates a [Yjs](https://yjs.dev/) `Y.Doc` instance, providing deterministic conflict resolution across tabs/devices and granular undo/redo history ([Yjs GitHub Repository](https://github.com/yjs/yjs)).
* **Relational Querying via SQLite WASM:** While [Yjs](https://yjs.dev/) manages real-time state, flushing card metadata and full-text content into [SQLite WASM](https://sqlite.org/wasm) backed by the browser's Origin-Private File System (OPFS) enables fast SQL queries, full-text search (FTS5), and backlink graph traversal across all boards ([GitHub Yjs-SQLite Project](https://github.com/samwillis/yjs-sqlite-test)).
* **Open Interoperability:** Boards export cleanly to the open JSON Canvas specification popularized by [Obsidian Canvas](https://obsidian.md/canvas) so users retain permanent portability ([Atlas Visual Research Alternatives](https://www.atlasworkspace.ai/blog/heptabase-alternatives)).

### Layer 3: Spatial Context Compiler & Agent Runtime

* **Spatial Context Serialization:** Unlike linear chat apps, a canvas encodes meaning through **proximity** (cards grouped inside a frame) and **topology** (nodes linked by arrows). When a user triggers an AI action on the canvas, the Spatial Context Compiler traverses the selected frame or connected subgraph and serializes the spatial hierarchy into structured XML/JSON context for the LLM ([tldraw Creative Design Use Cases](https://tldraw.dev/use-cases/creative-design)).
* **MCP Integration:** Exposes the active board state via a local or cloud **Model Context Protocol (MCP)** server—mirroring [Miro's MCP architecture](https://miro.com/pricing/)—so external tools like Claude Code, GitHub Copilot, or custom Python scripts can read and generate canvas nodes programmatically.

### Reference TypeScript & SQLite Data Schema

```typescript
// Core Atomic Entity (lives across one or many boards)
export interface AtomicCard {
  id: string;                  // UUIDv7 (time-sortable)
  type: 'markdown' | 'task' | 'code' | 'pdf_excerpt' | 'ai_prompt' | 'metric_chart';
  title: string;
  body: string;                // Markdown, source code, or JSON payload
  sourceUri?: string;          // Citation URL, local file path, or PDF page anchor
  tags: string[];
  embedding?: Float32Array;    // Vector embedding for semantic search & Spatial RAG
  createdAt: number;
  updatedAt: number;
}

// Spatial Instance on a Specific Board (allows one AtomicCard to appear on multiple boards)
export interface CanvasNode {
  id: string;
  boardId: string;
  cardId: string;              // Foreign key -> AtomicCard.id
  parentFrameId?: string;      // Optional grouping frame
  x: number;                   // World-space X coordinate
  y: number;                   // World-space Y coordinate
  width: number;
  height: number;
  zIndex: number;
  lodState: 'full' | 'compact' | 'cluster'; // Semantic zoom level-of-detail state
}

// Directed Edge / Connector between CanvasNodes
export interface CanvasEdge {
  id: string;
  boardId: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;              // e.g., "feeds into", "blocks", "cites"
   triggerAgentOnUpdate: boolean; // If true, upstream edits trigger downstream AI node
}
```

## 4. Key Architectural & Product Decisions to Make (ADRs)

Before writing application code, lock in these six foundational decisions. Each option carries distinct engineering, licensing, and monetization trade-offs.

### Decision 1: Target Niche & Initial Product Wedge

A generic "Miro for one person" is difficult to market against free tools like [Excalidraw](https://excalidraw.com/) or [Obsidian Canvas](https://obsidian.md/canvas) ([Storyflow Thinking Canvas Analysis](https://storyflow.so/blog/best-thinking-canvas-tools-2026)). Pick one high-willingness-to-pay daily workflow as your initial wedge:

| Niche Option | Target Persona | Core Daily Job-to-be-Done | Monetization Ceiling |
| :--- | :--- | :--- | :--- |
| **Option A: Visual Prompt & Agent Studio** | AI engineers, prompt engineers, LLM builders | Chain prompts, RAG chunks, and model outputs spatially to test and export agent graphs ([tldraw Creative Design Use Cases](https://tldraw.dev/use-cases/creative-design)) | High ($19–$29/mo Pro + API/compute usage) |
| **Option B: Solo Consultant Command Center** | Freelancers, fractional executives, solo PMs | Manage daily time-blocking, client deliverables, and 1-click read-only client status boards ([Carly AI Miro Pricing Breakdown](https://www.usecarly.com/blog/miro-pricing/)) | High ($15–$25/mo Pro business expense) |
| **Option C: Citation-Grade Research Canvas** | Analysts, legal researchers, grad students | Split-screen PDF/web clipping where every canvas card preserves verifiable page citations ([Heptabase](https://heptabase.com/), [Atlas Visual Research Alternatives](https://www.atlasworkspace.ai/blog/heptabase-alternatives)) | Medium ($9–$15/mo subscription) |
| **Option D: System Architecture & Code Map** | Full-stack developers, staff engineers | Sync local Git repos and Mermaid specs into a living visual system map ([Miro Blog March 2026](https://miro.com/blog/whats-new-march-2026/)) | Medium-High ($12–$20/mo + team upgrades) |

* **Decision to Record:** Choose **Option A** or **Option D** if you want to capitalize on developer/AI tooling and MCP workflows; choose **Option B** if you want the fastest path to B2B solo-consultant revenue.

### Decision 2: Canvas Rendering SDK Selection

Building an infinite canvas from raw `<canvas>` or DOM events takes months of debugging zoom math, touch gestures, and selection boxes ([tldraw Synergy Codes Overview](https://www.synergycodes.com/tldraw)).

| Engine Option | Best For | Pros | Cons & Licensing |
| :--- | :--- | :--- | :--- |
| **[tldraw SDK](https://tldraw.dev/)** | Freeform whiteboarding + rich custom React shapes ([tldraw GitHub](https://github.com/tldraw/tldraw)) | Production-ready camera, selection, undo/redo, multiplayer sync, and AI starter kits ([tldraw Homepage](https://tldraw.dev/homepage)) | Source-available custom license: free for development with watermark, requires a commercial license key to remove watermark in production ([tldraw GitHub](https://github.com/tldraw/tldraw)) |
| **[React Flow](https://reactflow.dev/)** | Node-and-wire workflows, agent pipelines, and data graphs ([React Flow](https://reactflow.dev/)) | MIT-licensed core, native React component nodes, automatic edge routing, and optional Pro whiteboard plugins ([React Flow Whiteboard Guide](https://reactflow.dev/learn/advanced-use/whiteboard)) | Less suited for freehand sketching or unstructured sticky-note brainstorming out of the box ([React Flow Whiteboard Guide](https://reactflow.dev/learn/advanced-use/whiteboard)) |
| **[Excalidraw](https://excalidraw.com/) + [PixiJS](https://pixijs.com/)** | Fully open-source MIT stack or ultra-massive 50,000+ node boards ([PixiJS](https://pixijs.com/)) | Zero commercial SDK licensing fees; [PixiJS](https://pixijs.com/) provides WebGPU/WebGL hardware acceleration ([PixiJS Intro](https://pixijs.com/8.x/guides/getting-started/intro)) | Requires significant custom engineering to embed rich interactive React cards and custom node connectors ([GitHub xyflow Issue #4003](https://github.com/xyflow/xyflow/issues/4003)) |

* **Decision to Record:** Select **[React Flow](https://reactflow.dev/)** if your product centers on structured AI/data pipelines (MIT core), or **[tldraw SDK](https://tldraw.dev/)** if freeform spatial arrangement and whiteboarding are primary.

### Decision 3: Storage & Multi-Device Sync Topology

* **Option A (Browser OPFS + Cloud CRDT Relay):** Store data in browser [SQLite WASM](https://sqlite.org/wasm) and sync encrypted [Yjs](https://yjs.dev/) deltas via Cloudflare Durable Objects or a lightweight Node.js WebSocket server ([tldraw Homepage](https://tldraw.dev/homepage), [Yjs Docs](https://docs.yjs.dev/ecosystem/ports-to-other-languages)).
* **Option B (Local Filesystem Vault):** Read and write `.md` and `.canvas` files directly to a folder on the user's hard drive (like [Obsidian Canvas](https://obsidian.md/canvas)), letting users sync via iCloud, Dropbox, Git, or a paid first-party sync service ([Atlas Heptabase vs. Obsidian](https://www.atlasworkspace.ai/blog/heptabase-vs-obsidian)).
* **Decision to Record:** Choose whether instant zero-install web access (**Option A**) outweighs plain-text local disk ownership (**Option B**).

### Decision 4: AI Execution & Token Cost Economics

AI credit caps are a major friction point in both [Miro](https://miro.com/pricing/) (25 to 50 credits/month on Starter/Business) and [Heptabase](https://heptabase.com/) ([Carly AI Miro Pricing Breakdown](https://www.usecarly.com/blog/miro-pricing/), [Fabric Heptabase vs. Obsidian Comparison](https://fabric.so/comparison/heptabase-vs-obsidian)).

* **Option A (Bring-Your-Own-Key + Local WebGPU):** Let users enter their own OpenAI, Anthropic, or Gemini API keys (or connect a local Ollama/WebLLM model) for free, charging only for the workspace software and cloud sync.
* **Option B (Bundled Managed AI Credits):** Include a monthly allowance of managed cloud AI runs in a $15–$20/month Pro tier, with top-up credit packs ([Carly AI Miro Pricing Breakdown](https://www.usecarly.com/blog/miro-pricing/)).
* **Decision to Record:** Offering **BYOK on the Free/Indie tier** plus **Managed Cloud AI on the Pro tier** maximizes developer adoption while preserving recurring SaaS margins.

### Decision 5: Application Packaging (Web PWA vs. Desktop App)

* **Option A (Web-First Next.js / Vite SPA):** Zero friction to try from a link and trivial to share published boards, but restricted by browser sandbox limits when accessing local codebases or CLI tools.
* **Option B (Desktop Wrapper via Tauri / Electron):** Grants native filesystem access, global OS quick-capture hotkeys, and local MCP server spawning, while sharing 95% of the React codebase ([OmniCanvas Heptabase Alternatives](https://omnicanvasnotes.com/blog/reviews/heptabase-alternatives)).
* **Decision to Record:** Start with a **Vite + React Web App** for rapid iteration, and wrap it in **Tauri** in Phase 2 for local filesystem and MCP server access.

### Decision 6: Monetization & Growth Loop

* **Tier 1 — Local Free Forever ($0):** Unlimited local boards (solving [Miro's 3-board cap](https://www.usecarly.com/blog/miro-pricing/)), local [SQLite WASM](https://sqlite.org/wasm) storage, JSON Canvas export, and BYOK AI support.
* **Tier 2 — Solo Pro ($12–$19/month):** Encrypted multi-device [Yjs](https://yjs.dev/) sync, managed cloud AI & RAG indexing, custom domain publishing for client boards, and automated daily backups.
* **Tier 3 — Creator Blueprint Marketplace (70/30 Revenue Split):** Inspired by [Miroverse's 7,000+ templates](https://miro.com/templates/), allow power users to package and sell pre-wired spatial AI workflows and industry templates directly inside the app.

## 5. Recommended Repository Structure

```text
solocanvas/
├── apps/
│   ├── web/                        # Vite + React + TypeScript SPA
│   │   ├── src/
│   │   │   ├── canvas/             # tldraw / React Flow custom shapes, tools, & LOD rules
│   │   │   ├── desk/               # Daily Desk viewport, calendar & task widgets
│   │   │   ├── store/              # Yjs document bindings & SQLite WASM OPFS worker
│   │   │   ├── ai/                 # Spatial Context Compiler & client-side RAG search
│   │   │   └── publish/            # Read-only public board viewer
│   ├── desktop/                    # Optional Tauri shell for native file & local MCP access
│   └── sync-worker/                # Cloudflare Worker / Node.js Yjs WebSocket relay
├── packages/
│   ├── schema/                     # Shared TypeScript interfaces, Zod validators & JSON Canvas export
│   ├── mcp-server/                 # Model Context Protocol server exposing canvas read/write tools
│   └── agent-workflows/            # LangGraph spatial reasoning & synthesis graphs
└── README.md
```

## 6. Phased Execution Roadmap

1. **Phase 1 — Core Canvas & Local Vault (Weeks 1–3):** Scaffold the Vite + React workspace, integrate [React Flow](https://reactflow.dev/) or [tldraw SDK](https://tldraw.dev/), and wire up local persistence using [Yjs](https://yjs.dev/) and [SQLite WASM](https://sqlite.org/wasm) ([GitHub Yjs-SQLite Project](https://github.com/samwillis/yjs-sqlite-test)). Implement reusable `AtomicCard` entities so a single note can be referenced across multiple boards ([Atlas Visual Research Alternatives](https://www.atlasworkspace.ai/blog/heptabase-alternatives)).
2. **Phase 2 — Daily Desk & Niche Widgets (Weeks 4–6):** Build the specialized card types for your chosen wedge (such as Markdown notes with bidirectional links, executable code/prompt nodes, or PDF highlight cards) and the default "Daily Desk" home board ([Fabric Heptabase vs. Obsidian Comparison](https://fabric.so/comparison/heptabase-vs-obsidian)).
3. **Phase 3 — Spatial AI & MCP Bridge (Weeks 7–9):** Implement the Spatial Context Compiler so selecting a frame or connected node graph passes structured context to an LLM pipeline, and expose local **MCP** tool definitions so external agents can populate the canvas ([Miro Pricing](https://miro.com/pricing/), [tldraw Creative Design Use Cases](https://tldraw.dev/use-cases/creative-design)).
4. **Phase 4 — Cloud Sync, Publishing & Launch (Weeks 10–12):** Add encrypted multi-device sync, one-click read-only board publishing for sharing outputs with clients or teammates, and Stripe billing for the Solo Pro tier ([Carly AI Miro Pricing Breakdown](https://www.usecarly.com/blog/miro-pricing/)).

## 7. Selected Direction & First Milestone

**Selected initial niche: System Architecture & Code Map (Option D).** SoloCanvas will first help individual developers create and explore visual maps of software systems. The existing sections describe the broader product vision; they are not a list of implemented features.

### Initial implementation decisions

- Begin with a Vite, React, and TypeScript web application. React Flow is the provisional canvas engine, subject to verifying its current licensing and suitability.
- Design local persistence and its limitations explicitly before implementation. The intended experience is local-first; cloud sync and publishing are later milestones.
- Native repository access, AI workflows, MCP, and desktop packaging will follow the basic canvas rather than being assumed available in a browser.

### Initial single-board milestone

The initial single-board milestone covered creating and editing component cards, labeled relationships, reload persistence, and recovery. The current workspace-first implementation is documented in Section 8.

### Future directions not implemented

Spatial AI context, an MCP bridge, desktop packaging, cloud sync, and publishing are future directions and are not part of the current application.

The detailed development plan and agent handoff live in [context/PLAN.md](context/PLAN.md) and [context/STATUS.md](context/STATUS.md). Agents work in turns on the shared branch, inspect the latest state before editing, and update the handoff with changes, actual checks, blockers, and next steps. The handoff is not a locking mechanism.

## 8. Current Application

The Vite/React app opens on the project workspace after first-run onboarding. To run it with Node.js 22, use `npm ci` followed by `npm run dev`; run `npm test`, `npm run build`, and `npm run test:browser` for checks.

On first run, start with an empty workspace or try the example. The example stays in memory until you select **Save workspace**. The overview lists your top-level boards. Each board holds connected components and sticky notes.

| On a board tile or canvas component | What happens |
| --- | --- |
| Click or double-click the title, or focus the card and press Enter | Edit its name in place. Renaming a shared component updates every placement. |
| Press Enter while editing, or move focus away | Apply the new name to the current workspace. Press Escape while editing to discard the draft. |
| Press Ctrl+Enter on the card or its title editor | Apply the name and open the board. On a component, this opens its placement’s mini-board, creating one on first use. |

Use the breadcrumbs to return to a parent board. Click inside a sticky note to write directly on the canvas. Enter adds another line, and dragging the border moves the note.

Each placement keeps its own position, shape and mini-board. Rectangle, rounded, pill and diamond components size themselves to their contents. File components show their path and, when available, source line count. A parent component previews its mini-board’s title, component, note and connection counts, and a sample of file paths and attachment names. Removing a placement or board with descendants prompts for confirmation and removes its nested tree.

Expand **Workspace files** or **Board files** in the workspace header, or **Component files** on a canvas component. Use **Attach file** to add a local file, select a filename to download its original bytes, or choose **Remove** to detach it. Component files are shared across every placement of the component. Board files belong to the individual board, including a nested mini-board. You can attach up to 256 KiB per file, 128 files and 1 MiB of file content across the workspace. **Save workspace** keeps these files on this browser origin, and **Export workspace** includes the files currently in memory.

Changes are not saved automatically. **Save workspace** uses browser Web Locks, checks that storage has not changed since opening, and writes a recoverable backup before replacing existing workspace data. Existing v1 board data remains untouched; v2 workspaces are migrated to v3 in memory and their raw data is retained as a backup on the first explicit save. The workspace recovery panel can export raw primary, backup, or damaged data and offers explicit restore when a valid backup exists. When no v2 workspace exists, the default workspace also exposes explicit restore for a valid previous v1 board backup; v1 recovery remains unavailable while newer workspace data exists. Storage is local to this browser origin; there is no cloud sync or remote backup.

The optional `/?legacy-board=1` route preserves the earlier single-board editor for compatibility. It has separate **Save board** and **Import board** actions; legacy JSON is not the same format as JSON Canvas.

The workspace also supports board renaming, deletion, component search, file maps, import-relationship suggestions, Mermaid import/export, and workspace JSON import/export. These are available from the board tools or the **Import / export** menu; advanced tools remain collapsed until opened. File-map and source-text limits, supported import syntax, and the behavior of each import/export operation are described below.

From a board, the file-map tool can create a new board from up to 100 user-selected files or a selected folder. It creates one card per selected relative path (or filename when selecting individual files). By default file contents are not read. You may opt in to importing UTF-8 JavaScript, TypeScript and Python source text (up to 64 KiB per file and 512 KiB total); unsupported, oversized or invalid files remain path-only and are reported. Imported text is displayed as plain text and is stored in browser data and workspace exports after saving, so review it for sensitive content. You can remove imported source text from a selected card. Component search checks names by default; enable **Search imported source text** to include that text. No network request, code execution, dependency analysis or ongoing folder sync is provided. Review the file paths before creating the board, then explicitly save the workspace. Folder selection excludes common generated subdirectories by default (including .git, node_modules, virtual environments, build outputs and coverage); review the excluded count and list, or disable the filter. Explicitly selected files are never excluded. After filtering, a selection of more than 100 files must be narrowed by selecting individual files.

On a file-map board containing imported source, **Analyze board imports** can suggest relationships for top-level static relative JavaScript and TypeScript imports and re-exports, TypeScript import-equals, plus dynamic imports with a string literal. Analysis runs in a cancellable browser worker on the current board only. Review the source path, line, specifier and target, inspect the source component, and choose which suggestions to add. Selecting an added relationship shows its recorded evidence and lets you open either component; evidence reflects the source at analysis time. It uses only files present on that board; ambiguous and unresolved imports are reported. For an ambiguous import with up to 25 candidate placements, you can explicitly choose a target; no target is chosen automatically. Non-relative imports, non-literal dynamic imports and require calls are reported but not resolved. Python imports are not analyzed. For TypeScript sources, emitted .js/.jsx/.mjs/.cjs extensions are matched against the corresponding selected source extensions only when there is a single match; ambiguous matches are reported. Suggestions are not added or saved automatically; type-only imports and re-exports are labeled separately. When multiple import kinds point to the same target, one relationship is proposed, prioritizing static runtime imports, then TypeScript import-equals, then dynamic imports, then type-only imports. Removing imported source from a card does not erase copies in previous workspace backups or exported files.

**Export board as Mermaid** downloads a one-way Mermaid flowchart for the current workspace board. It includes component names and directed relationship labels. It does not include layout, source text, card sharing, styles, metadata or other boards. The board must contain at least one component. The export supports up to 1,000 components, 3,000 relationships and 512 characters per label. A Chromium check renders a small export with Mermaid 11.4.1, including special characters and an attempted directive injection; other Mermaid versions and larger diagrams have not been verified.

**Import Mermaid diagram** accepts pasted text or a user-selected text file up to 5 MiB, but only the exact escaped `flowchart LR` format emitted by SoloCanvas: generated node IDs, quoted labels and directed relationships with optional labels. Unsupported Mermaid statements—including directives, HTML syntax and click actions—are rejected with line-specific errors. Imported labels are treated as plain text; escaped control code points such as NUL and newline are preserved as inert text, Mermaid is not rendered, scripts are not run, and the diagram is not sent over the network. Review the component and relationship preview, then explicitly confirm creation of a separate board. Repeated relationships, including duplicate edges, are preserved in input order. Imported components are new, independent cards with a deterministic grid layout; positions, shared-card identity, source text and metadata are not preserved. Existing boards and unsaved edits remain in place. The import is not saved until **Save workspace** succeeds; canceling or a failed/stale import leaves the workspace unchanged. This is not a general-purpose Mermaid parser.

In the multi-board workspace, **Import workspace** opens an exported SoloCanvas v2 or v3 workspace JSON file of up to 5 MB. It replaces the in-memory workspace after confirmation; it does not merge and does not alter stored data until **Save workspace** succeeds. Export unsaved work first. The legacy v1 **Import board** action remains separate.

### Next automation handoff

Codex and Copilot take turns on `ritishsajja-nested-boards-and-notes`. At the start of each turn, check the branch head, recent commits, active peer work and the newest entry in [the agent handoff](context/STATUS.md). At the end, record the changes, checks and next step there.

For the workspace usability pass, verify first-run and returning-user routing, the unsaved sample, inline editing, Ctrl+Enter navigation and all four shapes on a narrow viewport. Confirm shared component files and placement-specific summaries after save and reload, and download a file from each scope. Check v2 migration and backup recovery alongside the new interactions. Run `npm test`, `npm run build` and `npm run test:browser`, then record the results against the commit tested.

## 9. License, Release, and Verification

### License and third-party packages

SoloCanvas is licensed under the Apache License, Version 2.0 (SPDX: `Apache-2.0`); see [LICENSE](LICENSE). The copyright notice identifies Ritish-Sajja, matching the repository's recorded maintainer name.

The direct dependencies' license identifiers, as recorded in `package-lock.json`, are MIT for `@xyflow/react`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, and Vite; and Apache-2.0 for TypeScript and `@playwright/test`. This is a summary of direct package metadata, not a complete audit of transitive dependencies or a legal compliance review.

### Release and certification status

This repository contains an early prototype, not a production release. `package.json` keeps the package marked `private`; the repository's workflow verifies builds and tests but does not publish or deploy the app. No hosted URL is documented here. No product, security, privacy, accessibility, or regulatory certification is documented or claimed. A software license is not a certification, and no certification badge is displayed.

### Verification and prior CI failures

The GitHub Actions workflow runs on pushes and pull requests with Node.js 22. It installs from the lockfile, runs `npm test` and `npm run build`, then runs development and production Chromium checks plus a Mermaid 11.4.1 renderer compatibility check.

Local verification for this update (2026-11-21): `npm test` passed (67 tests), `npm run build` passed, and `npm run test:browser` passed 48 tests with its optional Mermaid renderer test skipped because no bundle was configured. Running that renderer test separately with Mermaid 11.4.1 also passed.

The latest recorded renderer-check failure (run [44923740357](https://github.com/RitishSajja/SoloCanvas/actions/runs/44923740357)) was caused by the test querying an obsolete Mermaid edge selector, so it found no rendered edges. The selector was corrected; subsequent runs [44923964265](https://github.com/RitishSajja/SoloCanvas/actions/runs/44923964265) and [44924168253](https://github.com/RitishSajja/SoloCanvas/actions/runs/44924168253) passed the unit, build, browser, and renderer checks.

Earlier worker-analysis checks also failed: run [44410372795](https://github.com/RitishSajja/SoloCanvas/actions/runs/44410372795) timed out while the browser worker was starting; run [44410741342](https://github.com/RitishSajja/SoloCanvas/actions/runs/44410741342) lost the editor page during Vite dependency optimization and separately lost rendered nodes after reload. The handoff records the page reload as consistent with Vite re-optimizing a newly discovered dependency, but does not claim that cause was independently proven. Worker readiness handling and dependency prebundling followed, and run [44411177317](https://github.com/RitishSajja/SoloCanvas/actions/runs/44411177317) passed unit, build, development-browser, and production-browser checks.

## 10. 3–5 Minute Demo Script

Have a small JavaScript or TypeScript project folder with a few relative imports ready. This walkthrough demonstrates the existing local architecture-mapping workflow; it does not demonstrate the AI/RAG, MCP, cloud sync, desktop, authentication, billing, or publishing roadmap.

1. **0:00–0:30 — Set expectations.** Describe SoloCanvas as an early, local-first architecture-map prototype. The app runs in the browser and saves only when asked; there is no cloud account or sync.
2. **0:30–1:20 — Map a project.** From the workspace overview, create a board and select the prepared folder for a file map. Keep source-text import off to show the default path-only behavior. Review the selected and excluded file counts before creating the board.
3. **1:20–2:35 — Review relationships.** Choose **Analyze board imports**. Show that the app proposes supported relative JavaScript/TypeScript imports for review rather than silently changing the graph. Inspect a suggestion and its source evidence, then add only the relationships you want.
4. **2:35–3:30 — Edit and save.** Move a component, edit its name, or add and label a relationship. Save the workspace explicitly, then point out that saved data belongs to this browser origin and is not synced or backed up remotely.
5. **3:30–4:00 — Export and close honestly.** Export the current board as a Mermaid flowchart. Explain that this is a one-way diagram export, not an import or a hosted share link, and distinguish implemented mapping from the longer-term AI, MCP, sync, desktop, and publishing roadmap.
