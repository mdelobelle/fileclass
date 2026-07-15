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
| `fixture-vault/` | Deterministic seed vault: `Notes/*.md` + `canary.base`. |

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
`src/engine/basesAdapter.ts` is the only file expected to need changes); `2` =
the harness could not reach Obsidian (see the printed instructions).

## Adding scenarios (later phases)

`canary.mjs` is the skeleton. Field-write, draft-editor-atomicity, and
lookup/formula-recalc scenarios (§14) are added here as the corresponding
phases land, each asserting on `fixture-vault` file contents through the same
`evaluate(...)` bridge.
