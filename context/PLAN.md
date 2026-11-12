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

