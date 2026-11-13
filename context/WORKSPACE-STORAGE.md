# Versioned workspace persistence (experimental)

The v2 adapter is not wired into the application. The current UI still uses the v1 board key.

A read prefers an existing valid v2 workspace, otherwise converts a valid v1 board in memory, or offers an empty workspace. A corrupt or unsupported v2 blocks loading even if v1 exists; this avoids silently discarding newer work. Reads never write to storage. An explicit write checks snapshots of both keys, saves the prior valid v2 as a backup, and writes v2 without altering v1. The adapter rejects data that would be lost by JSON serialization.

This is not an atomic compare-and-swap: separate tabs can race between the check and write. It also does not provide v2 backup recovery, automatic rollback, or cross-version synchronization; once v2 is edited, the v1 copy is only an old recovery source. Do not connect this adapter to production UI until atomicity and recovery strategy, user-facing errors, export, and migration/browser tests are addressed. Never delete the v1 data during migration.

A new opt-in `writeWorkspaceLocked` wrapper takes an exclusive Web Lock around the snapshot check and write, and fails closed when locking is unavailable. This only serializes clients that use the same lock; the existing v1 UI and direct `writeWorkspace` calls do not cooperate. Legacy writes and arbitrary localStorage changes can still race. The UI is intentionally not connected to v2 yet. Before integration, enforce the locked path for all v2 writes, handle unsupported browsers, v1 coexistence, recovery/export and migration policy; test actual browsers and failure paths.

The experimental recovery API first inspects a damaged v2 primary and a valid v2 backup without writing. Explicit restoration requires a matching snapshot and the v2 Web Lock, archives the damaged primary in a separate key, and preserves both the v1 board and backup. It refuses unknown versions and refuses to overwrite a different existing damaged archive. Its checks are effective only against writers that cooperate with the same lock; v1 and external writes remain outside it. No UI or export of the raw archive exists yet.
