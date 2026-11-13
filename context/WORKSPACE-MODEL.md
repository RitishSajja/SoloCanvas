# Workspace model: initial implementation

This is a pure in-memory model for milestone 3. The UI and persistent storage still use the existing single-board v1 format; the app does not yet migrate or store v2 workspaces.

- A version 2 workspace contains canonical cards and multiple named boards.
- Card data lives once in the workspace. Each board node has its own ID, placement and card reference. Edges refer to nodes on the same board.
- The migration helper converts a v1 board to one workspace and creates one card per existing node. It preserves node data, geometry, edges and other JSON board properties and rejects duplicate IDs and dangling references rather than silently dropping data.
- Projecting a board copies current canonical card data into canvas nodes. Updating a card creates a new workspace, so all projected instances see its new data without changing the input.
- IDs are scoped to their collections; each node ID and edge ID is unique within its board. Cross-board edges are not supported.
- This is a proposed model, not a persistence migration. Before connecting it to the UI, design durable atomic writes, migration rollback, validation, backup, import/export compatibility, concurrent tabs, and tests against existing data. localStorage's existing comparison is not an atomic lock.
