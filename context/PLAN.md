# SoloCanvas development plan

## Product focus
System Architecture & Code Map: a local-first spatial workspace for developers to map systems and relate components to code. The supplied README is the product blueprint. Its alternatives and later roadmap remain proposals, not completed features.

## Initial decisions
- Start with a Vite, React and TypeScript web application, as recommended in the README.
- Provisionally use React Flow for the component-and-connection workflow; verify current licensing and suitability before adoption.
- Decide local persistence after evaluating the README's options. Document authoritative data, durability, export and any limitations before implementing sync.
- Keep desktop filesystem access, AI, MCP, publishing and cloud features in later milestones. Do not promise browser access to arbitrary files.

## Milestones
1. Define MVP and architecture decisions; scaffold and run the application with meaningful checks.
2. Create, edit, move and connect component cards on a board; persist and restore the board locally. Verify the full workflow after reload.
3. Support multiple boards and reusable atomic cards with shared edits, search and backlinks; test persistence and cross-board behavior.
4. Add user-selected repository import and an inspectable code map within the chosen runtime's access limits; document supported languages and import limitations.
5. Add Mermaid interoperability with explicit supported syntax and round-trip limitations.
6. Add spatial context serialization, a narrow AI workflow and MCP integration; verify permission boundaries and handle credentials safely.
7. Evaluate desktop packaging, optional sync and read-only publishing against concrete requirements.

Each milestone requires observable acceptance criteria, relevant checks and an updated handoff. The README's timeline is an estimate, not a guarantee. Clarify product decisions that materially change scope before treating the overall product as complete.

## Current code-map priorities

1. Verify folder refresh against the shared branch head. Create a path-only map, reselect the folder after a file's size or modification time changes, and review that file individually. On an older map, establish the first metadata baseline. Mark a file missing, save and reload, then restore the same path and check its placement, nested board and connections.
2. Exercise the opt-in source workflow with a file component reused on another board. Confirm an accepted source edit appears in both placements. Review the specifier, line, import kind and target for each inferred relationship change. Accept one change, leave another unchecked, and verify a manual relationship survives. Include an unreadable or over-limit file in the selection.
3. Follow both **Depends on** and **Used by** in the dependency explorer. Use the next level to follow a shared component onto a different board and verify that its link selects the expected placement after navigation. Record the branch head, checks and outstanding gaps in the agent handoff.
4. Milestone 6 begins with a local JSON preview and download for one board or its connected placements. Verify stable IDs and ordering, privacy defaults, explicit note-text inclusion, empty boards, repeated placements, nested board references and preservation of existing saved data.
5. Use the preview for one local architecture-question workflow. Let the user inspect a question alongside its exact context and explicitly copy it for an assistant. Test scope changes and cancellation before adding any external provider or MCP integration.
6. Add the rectangular selection described in the spatial compiler roadmap as a third context scope. Define how a placement intersects the rectangle in board coordinates, handle zoom and pan, and offer a keyboard-accessible selection method. Use the same filtered context for the JSON preview, download and question. Verify empty selections, repeated placements, crossing links and note privacy.
7. Expose one explicitly chosen board-context export as a read-only MCP resource over local stdio. Confirm the supported protocol against official documentation, validate the exported format, and verify discovery and reading with a client. Cover invalid input and attempts to request other files. Document how to use a fresh export after the board changes.
8. Make the reviewed snapshot usable for an explicit architecture question in a compatible MCP host. Let the user supply their question and inspect the context used by the host. Keep the local server read-only and independent of a model provider.
