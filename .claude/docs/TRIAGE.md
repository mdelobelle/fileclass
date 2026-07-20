# Issue triage (for Claude Code)

Goal: turn a structured issue into a **verdict + proposed resolution** fast. The
issue forms (`.github/ISSUE_TEMPLATE/*.yml`) exist so every report carries the
fields below with stable IDs. Metadata Menu drowned in 548 issues partly because
reports were unstructured — don't lose that discipline.

## Fetching an issue

`gh` is not installed in this environment. Read issues via the public API with
WebFetch (repo is public):

- One issue: `https://api.github.com/repos/mdelobelle/fileclass/issues/<N>`
- Open issues: `https://api.github.com/repos/mdelobelle/fileclass/issues?state=open&per_page=50`
- Comments: append `/comments`.

The form renders as a Markdown body with `### <label>` headings — parse those.

## Triage procedure

1. **Gate checks (from `Pre-flight checks`)** — if Metadata Menu was left
   enabled, Bases disabled, or not on the latest version, that is very likely the
   cause. Ask them to fix that first (label `needs-info`) before deeper analysis.
2. **Classify**: bug / feature / question(misfiled) / duplicate / out-of-scope.
   - **Out of scope** (close politely, point to Bases): `Lookup`/`Formula`
     computed fields, Dataview-style inline fields, anything that is really a
     query/report → a Bases view does it.
3. **Route by the `Area` field** to the code (see map below).
4. **Reproduce** from `fileClass definition(s)` + `Steps to reproduce` +
   `note frontmatter`. If any is missing/insufficient → `needs-info` with the
   exact missing piece. Fileclass is schema-driven: no fileClass definition = not
   reproducible.
5. **Root-cause**: read the routed module(s), form a hypothesis, cite
   `file:line`. Cross-check `Console errors` stack frames.
6. **Propose a resolution**: the fix approach (file + change), or a config/usage
   answer, or "out of scope + why". Note if it needs a unit test (it usually does).

## Area → code map

| Form `Area` | Where to look |
|---|---|
| Schema & inheritance | `src/schema/` (`fileClass.ts`, `resolver.ts`, `inheritance.ts`, `fileclassIndex.ts`) |
| Fields & typed input | `src/fields/` (`input/`, `values.ts`, `valuesIo.ts`, `options.ts`) |
| Data validation | `src/fields/validate.ts`, `src/views/fileclassTableView.ts`, API `validate` |
| Views / Bases | `src/views/` (`baseFileGenerator.ts`, `baseSync.ts`, `baseYaml.ts`, `fileclassTableView.ts`), `src/engine/basesAdapter.ts` |
| Canvas fields | `src/fields/canvas/` |
| UI | `src/ui/` (`noteFieldsModal.ts`, `indicator/`, `propertyEditButtons.ts`, `contextMenu.ts`) |
| Settings | `src/settings/` |
| Public API | `src/api/` (`fileclassApi.ts`, `filter.ts`) |
| Indexing / performance | `src/schema/fileclassIndex.ts`, `src/engine/queryCache.ts` |

> `basesAdapter.ts` is runtime-proven — never propose refactoring its call
> sequence (see ARCHITECTURE.md §3.1). CLI/TUI bugs belong in the separate
> `mdelobelle/fileclass-cli` repo (see [[fileclass-community-submission]]).

## Suggested labels

`bug` / `enhancement` (auto-applied by the form) · `needs-info` ·
`needs-repro` · `duplicate` · `out-of-scope` · `good first issue` ·
plus an area label matching the table above.

## Output shape (triage comment)

Keep it short and actionable:

> **Triage:** <bug|feature|question|duplicate|out-of-scope>
> **Area:** <area> — <file:line if known>
> **Root cause / analysis:** <one or two sentences>
> **Proposed resolution:** <fix approach | usage answer | why out of scope>
> **Needs from reporter:** <nothing | the specific missing field>
