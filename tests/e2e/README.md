# E2E & canary tests

These tests drive a **live dev Obsidian** over the Chrome DevTools Protocol
(CDP) — they exercise the real Bases internals the plugin depends on, which
cannot be mocked (ARCHITECTURE.md §14). Pure logic is covered by the vitest
unit suite instead (`tests/unit/`, run with `npm test`).

## What's here

| File | Role |
|------|------|
| `cdp.mjs` | Minimal CDP client: connect to Obsidian on `:9222`, `evaluate(fn, ...args)` in its renderer. No external npm dependency (uses Node 22's global `WebSocket`/`fetch`). |
| `canary.mjs` | The two canary tests (run at every Obsidian upgrade): adapter fixture rows + `processFrontMatter` order preservation. |
| `fixture-vault/` | Deterministic seed vault: `Notes/*.md` + `canary.base` + `two-fileclasses.base`. |
| `fixture-vault/two-fileclasses.base` | Issue #55 anchor: two views (`Book`, `Book authors`) for two fileClasses, each with a **view-level** filter and no base-wide filter — the target shape a sync/regenerate must never regress back to All-views. |

## Running the canaries

1. Launch a dev Obsidian with remote debugging, opened on the fixture vault:

   ```sh
   open -na Obsidian --args --remote-debugging-port=9222
   ```

   Open `tests/e2e/fixture-vault/` as the vault, enable the **Fileclass** plugin
   (and the core **Bases** plugin), and build the plugin first: `npm run build`.

2. Run the canaries:

   ```sh
   npm run test:e2e
   ```

Exit code `0` = all canaries passed; `1` = a check failed (adapter drift —
the fix is a release of `obsidian-bases-adapter`, then a bump here); `2` =
the harness could not reach Obsidian (see the printed instructions).

## Adding scenarios (later phases)

`canary.mjs` is the skeleton. Field-write and draft-editor-atomicity scenarios
(§14) are added here as the corresponding phases land, each asserting on
`fixture-vault` file contents through the same `evaluate(...)` bridge.
