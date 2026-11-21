# Versioned workspace persistence

The workspace UI stores schema version 3 in the historical `solocanvas.workspace.v2` key. Reads prefer a valid workspace value, otherwise migrate a valid v1 board in memory or offer an empty v3 workspace. A corrupt or unsupported workspace blocks loading instead of falling back and risking loss. Reads do not write to storage.

Version 2 workspaces are upgraded in memory: existing cards, boards, placements, edges, and board extras are retained; placements get the default pill shape; boards receive empty sticky-note collections and top-level ancestry. On explicit save, the locked writer checks the snapshots of both workspace and legacy keys, stores the prior raw workspace (including v2 data) in the backup key, and writes v3. It never removes or rewrites the v1 board. Imports and edits remain unsaved until the user selects Save workspace.

All v3 UI saves use `writeWorkspaceLocked`, which takes the workspace Web Lock and fails closed if lock support is unavailable. The lock only coordinates updated clients that use the same lock. Older deployed clients and arbitrary localStorage writes can still race; this is not a universal atomic compare-and-swap.

Recovery inspection is read-only. Explicit restoration requires an unchanged recovery snapshot and the same Web Lock, archives the damaged primary in a separate key, and preserves the backup and v1 board. Version 2 backups are accepted and migrated in memory when read; their raw contents remain available in the backup key. Unknown versions and a different existing damaged archive are rejected.

The v1 editor checks for the workspace primary key at load and before save or restore, refusing v1 writes if a workspace exists. This reduces downgrade risk for updated clients but is not atomic and does not govern older deployments. Never delete the v1 data during migration or claim universal cross-version synchronization.
