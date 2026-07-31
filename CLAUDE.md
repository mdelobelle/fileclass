# CLAUDE.md — Fileclass plugin

**Before any task: read `.claude/docs/ARCHITECTURE.md` entirely.** It contains
the binding design decisions (D1-D8), the runtime-verified facts about Obsidian
internals this plugin relies on, the module map, and the phase plan. Do not
contradict it; if a task seems to require deviating, stop and ask.

**Triaging a GitHub issue?** Follow `.claude/docs/TRIAGE.md` — it maps the issue
form fields to code areas and defines the analyze → propose-resolution flow.

Hard rules (details in the architecture doc):
- `src/engine/basesAdapter.ts` is **runtime-proven code — do not refactor it**;
  it is the only module allowed to touch Bases/private Obsidian internals.
- Frontmatter-only: reads via `metadataCache`, writes via
  `app.fileManager.processFrontMatter`. Never parse or edit note text lines.
- No dataview imports or references, ever.
- Never use the bare global `app`: use `getPlugin().app` (singleton in
  `src/globals.ts`) or an explicit `App` parameter.
- TypeScript strict; **no `any` anywhere** (the Obsidian review linter forbids it
  and disabling the rule). Private internals in `src/engine/basesAdapter.ts` use
  `unknown` casts to minimal interfaces instead.
- Every phase deliverable includes unit tests (vitest) and a doc page (mkdocs).
- **Every feature also gets a demo scenario proposed** — tests, docs, *and* a
  `demo/NNN_*/` take (see `demo/SCENARIO.md`, or the `demo-scenario` skill).
  Propose it as part of finishing the feature, without being asked; it doubles as
  the manual smoke test, so a feature that can't be narrated in one calm minute
  is a signal about the feature, not about the video. Propose the step list and
  wait for approval before writing the scenario.

Reference implementation to port behavior from (fileClass format, field UX):
`/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/metadatamenu/` — port semantics,
not code style; that codebase carries dataview-era baggage this plugin must not
inherit.
