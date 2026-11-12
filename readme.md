# SoloCanvas: Local-First Spatial Workspace & AI Command Center

**SoloCanvas** is an architectural blueprint and project specification for a single-player infinite canvas application tailored to an individual professional's day-to-day execution. While enterprise platforms like [Miro](https://miro.com/) serve over 100 million users and 250,000 companies ([Miro Homepage](https://miro.com/)), their feature sets and per-seat billing models are built for cross-functional team workshops rather than solo daily productivity ([Carly AI Miro Pricing Breakdown](https://www.usecarly.com/blog/miro-pricing/), [Storyflow Thinking Canvas Analysis](https://storyflow.so/blog/best-thinking-canvas-tools-2026)).

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
