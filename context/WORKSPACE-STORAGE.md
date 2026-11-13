# Versioned workspace persistence (experimental)

The v2 adapter is not wired into the application. The current UI still uses the v1 board key.

A read prefers an existing valid v2 workspace, otherwise converts a valid v1 board in memory, or offers an empty workspace. A corrupt or unsupported v2 blocks loading even if v1 exists; this avoids silently discarding newer work. Reads never write to storage. An explicit write checks snapshots of both keys, saves the prior valid v2 as a backup, and writes v2 without altering v1. The adapter rejects data that would be lost by JSON serialization.

This is not an atomic compare-and-swap: separate tabs can race between the check and write. It also does not provide v2 backup recovery, automatic rollback, or cross-version synchronization; once v2 is edited, the v1 copy is only an old recovery source. Do not connect this adapter to production UI until atomicity and recovery strategy, user-facing errors, export, and migration/browser tests are addressed. Never delete the v1 data during migration.
