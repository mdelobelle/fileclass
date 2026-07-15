# CLAUDE.md — Fileclass plugin

**Before any task: read `.claude/docs/ARCHITECTURE.md` entirely.** It contains
the binding design decisions (D1-D8), the runtime-verified facts about Obsidian
internals this plugin relies on, the module map, and the phase plan. Do not
contradict it; if a task seems to require deviating, stop and ask.

Hard rules (details in the architecture doc):
- `src/engine/basesAdapter.ts` is **runtime-proven code — do not refactor it**;
  it is the only module allowed to touch Bases/private Obsidian internals.
- Frontmatter-only: reads via `metadataCache`, writes via
  `app.fileManager.processFrontMatter`. Never parse or edit note text lines.
- No dataview imports or references, ever.
- Never use the bare global `app`: use `getPlugin().app` (singleton in
  `src/globals.ts`) or an explicit `App` parameter.
- TypeScript strict; `any` allowed only inside `src/engine/basesAdapter.ts`.
- Every phase deliverable includes unit tests (vitest) and a doc page (mkdocs).

Reference implementation to port behavior from (fileClass format, field UX):
`/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/metadatamenu/` — port semantics,
not code style; that codebase carries dataview-era baggage this plugin must not
inherit.
