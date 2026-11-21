# Mermaid import design handoff

## Goal and boundaries
Add an explicitly reviewed, one-way import of a narrowly defined Mermaid flowchart subset into a new board. The existing exporter remains lossy: it does not preserve positions, source text, metadata, styles, other boards, or shared-card identity. Do not advertise round-trip fidelity.

## Proposed first increment
- Accept pasted text or a user-selected local text file, with a clear size limit. Read locally and never load URLs, run scripts, enable click actions, or transmit the diagram.
- Define and document the exact accepted grammar before coding: start with the application's own `flowchart LR` output, generated node IDs, quoted node labels, directed edges with optional labels, and its decimal character escapes. Ensure the decoder validates Unicode code points and handles label characters safely.
- Validate the entire input before offering an import. Reject unsupported statements, malformed escapes, unknown node IDs, duplicate definitions, directives, HTML and click actions with line-specific messages; never silently discard unsupported content. Treat any support for Mermaid comments, different directions, node forms, or manually written diagrams as a later explicitly tested expansion.
- Apply node, relationship, label and input limits before creating workspace objects. Generate fresh IDs and deterministic initial positions. Keep duplicate placements distinct; do not infer shared-card identity.
- Present a preview of proposed components and relationships and disclose losses. Require an explicit confirmation to create a separate board. Do not overwrite the current board or the saved workspace. Respect the existing workspace validation, locking, unsaved-changes and explicit-save flow; cancel safely if the workspace changes while preparing the import.
- Add unit tests for parser boundaries, exact exported examples, special characters, duplicates, malicious input and size limits. Add browser tests for review, cancellation, explicit save/reload, and concurrent-edit protection.

## Before implementing
Inspect current workspace mutation and save paths, README limits, open PRs, and agent ownership. Verify the grammar against real Mermaid rendering, especially edge-label escaping and Unicode. Decide how to present a failed import without losing the pasted input. Importing arbitrary Mermaid syntax is not an acceptance criterion for this first increment.
