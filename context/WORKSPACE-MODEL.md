# Workspace model

The workspace UI and persistence use schema version 3. A workspace contains canonical shared cards and named boards. Each board contains independent component placements, relationships, and sticky notes. Component shape (`rectangle`, `rounded`, `pill`, or `diamond`) belongs to a placement, so appearances of the same shared card can look different.

A top-level board has `parentPlacement: null`. A mini-board identifies its parent placement with `{ boardId, nodeId }`. Each placement can own one mini-board, including placements inside mini-boards, so chains can be nested to any depth. When opening a v2 workspace, a surviving mini-board whose parent was removed becomes a top-level board. This preserves its contents and descendants. For v3, validation rejects missing parent boards or placements, repeated parent references, and cycles before a workspace is opened, imported, or saved.

The first top-level board in stored board order is protected. The workspace model enforces this for individual and recursive board deletion, including imported and migrated workspaces. Removing any other board, or a placement with a mini-board, also removes its nested board subtree. The UI identifies affected contents before applying the change in memory. Shared cards and their attachments remain available after their placements are removed.

Legacy v1 boards migrate in memory to a single v3 top-level board. Version 2 migration retains boards, placements and valid parent links, assigns the default pill shape and initializes empty notes. An explicit, locked save stores the original v2 raw value in the existing backup key before writing v3. The v1 board is retained.

The workspace, each board and each shared card can have an optional `attachments` array. Each entry has an ID, filename, original byte count and base64 content. An absent array means the owner has no attachments. Limits apply to the decoded bytes, up to 256 KiB per file and 1 MiB or 128 files across all owners. Adding a placement of an existing card shares its files and counts them once. Explicit workspace save and JSON export preserve the attachments.

The canvas derives a component’s displayed size and summary from the shared card and its placement’s immediate child board. A placement can show different board details from another placement of the same card. Moving a component or changing its shape leaves the summary’s source data intact.

Projecting a board copies its canonical card data into canvas nodes. Mutations return a new workspace. IDs are unique within their collections; placement references remain board-scoped, and relationships cannot cross boards.
