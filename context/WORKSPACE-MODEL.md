# Workspace model

The workspace UI and persistence use schema version 3. A workspace contains canonical shared cards and named boards. Each board contains independent component placements, relationships, and sticky notes. Component shape (`rectangle`, `rounded`, `pill`, or `diamond`) belongs to a placement, so appearances of the same shared card can look different.

A top-level board has `parentPlacement: null`. A mini-board identifies its parent placement with `{ boardId, nodeId }`. Each placement can own one mini-board, including placements inside mini-boards, so chains can be nested to any depth. Validation rejects missing parent boards or placements, repeated parent references, and cycles before a workspace is opened, imported, or saved.

Removing a placement with nested boards explicitly removes that placement's entire mini-board subtree and its relationships. Removing a board explicitly removes its nested board subtree. The UI confirms either cascade before changing the unsaved workspace; direct board removal rejects boards with children, and the final board cannot be removed. Shared cards remain available after their placements are removed.

Legacy v1 boards migrate in memory to a single v3 top-level board. Version 2 workspaces migrate in memory by retaining boards and placements, assigning the default pill shape, and creating empty notes and top-level ancestry. Reads do not write. The original v2 raw value remains until an explicit, locked save, which stores that raw value in the existing backup key before writing v3. The v1 board is never deleted.

Projecting a board copies its canonical card data into canvas nodes. Mutations return a new workspace. IDs are unique within their collections; placement references remain board-scoped, and relationships cannot cross boards.
