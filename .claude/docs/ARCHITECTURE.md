# Fileclass — Architecture & Implementation Plan

> **Read this file entirely before writing any code.** It encodes decisions and
> runtime-verified facts established during the design phase (July 2026). Do not
> re-litigate the decisions in §2; do not "improve" `src/engine/basesAdapter.ts`
> without re-running its verification protocol (§14).

## 1. What this plugin is

**Fileclass** is the schema and data-quality layer for Obsidian vaults: typed,
validated, per-note-type property schemas ("fileClasses") with guided input,
nested objects, computed fields — using the **core Bases plugin as query/view
engine**. It is the successor of [Metadata Menu](https://github.com/mdelobelle/metadatamenu)
(same author). Metadata Menu goes into maintenance mode; users relying on
dataview inline fields stay there.

Positioning vs core Obsidian:
- core **Properties** types are flat and vault-global; no per-class schema, no
  constrained values, no relations, no nested editing.
- core **Bases** queries/views properties (including nested ones) but cannot
  edit nested values and has no schema.
- **Fileclass** = fileClass schemas (≈ table schema), File/MultiFile fields
  constrained by a Base view (≈ foreign key), Select (≈ enum), Lookup
  (≈ reverse relation), Formula (≈ computed column, persisted), Object/ObjectList
  (nested typed structures with a real editor).

## 2. Non-negotiable design decisions

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | **No dataview dependency, ever.** | Query engine = Bases via `src/engine/basesAdapter.ts`. `dvQueryString`/`customRendering`/`customSorting` options from legacy fileClasses are ignored (migration audit reports them, §13). |
| D2 | **Frontmatter-only.** No inline (`key:: value`) fields. | All reads via `metadataCache.getFileCache(f).frontmatter`; all writes via `app.fileManager.processFrontMatter`. No line-level note parsing (Metadata Menu's `note/lineNode` machinery is NOT ported). |
| D3 | **fileClass file format is Metadata Menu's, unchanged.** | Normative reference: `/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/metadatamenu/src/fileClass/fileClass.ts` (+ `fileClassAttribute.ts`). Existing fileClass notes must load as-is (minus D1 options). |
| D4 | **All Bases private-API access lives in `src/engine/basesAdapter.ts`.** | No other module may touch `embedRegistry`, `internalPlugins.getPluginById('bases')`, controllers, datasets. The adapter feature-detects and throws `BasesUnavailableError` with a graceful UI fallback upstream. |
| D5 | **Editing of Object/ObjectList = draft editor.** | Clone value → edit draft in memory → validate against schema → single atomic `processFrontMatter` write. Never write per-subfield. Never regenerate an object from the schema: always mutate the user's object (preserves unknown keys). |
| D6 | **Views = registered custom Bases view** (editable cells), plus auto-generated `.base` files per fileClass. No bespoke table engine (Metadata Menu's `fileClassTableView`/`fileClassDataviewTable` are NOT ported). |
| D7 | Global singleton pattern: `getPlugin()` from `src/globals.ts`. **Never use the bare global `app`** — always `getPlugin().app` or an explicit `App` parameter (adapter functions take `app` explicitly for testability). |
| D8 | Docs and tests are part of each phase's definition of done, not a final phase. |

## 3. Runtime-verified facts (Obsidian 1.13.2, July 2026)

These were verified experimentally against a live Obsidian. They are the
contract the code relies on. If any breaks on a newer Obsidian, the canary
tests (§14) must catch it.

### 3.1 Bases internals (used only inside basesAdapter)
- `app.embedRegistry.embedByExtension['base']` is a factory
  `(context, file, subpath) => embed`; the embed's **constructor creates a
  QueryController** without any workspace leaf. `embed.loadQuery()` =
  `vault.read` + `Query.fromString(yaml)` — pure read, no rendering.
- Never call `controller.setQuery()` headless: it triggers `update()` →
  `runQuery()`, whose loop **suspends until `viewContainerEl.isShown()`**
  (`isShown = !!offsetParent`). Instead assign `controller.query = q` directly.
- `controller.buildBasesContext(viewConfig.filters)` returns a context
  combining base-level and view-level filters (`FilterCls.and`). Entry class is
  reachable via `new (ctx.constructor)(app, null, {}, anyTFile)._local.constructor`.
- Filtering loop (replicating the plugin's own `runQuery`): for each
  `app.vault.getFiles()`, skip `metadataCache.isUserIgnored(path)`, build
  `new Entry(ctx, file)`, keep if `!ctx.filter || ctx.filter.test(entry)`.
  Files whose filter throws are excluded (same as native behavior).
- Sorted/grouped rows: populate `controller.results`, attach a table view from
  `internalPlugins.getPluginById('bases').instance.getViewFactory('table')(controller, controller.viewContainerEl)`,
  set `view.config`, `controller.view = view`, `controller.initialScan = false`
  (notifyView is a no-op otherwise), call `controller.notifyView()` →
  `view.data` is the dataset. **The dataset constructor already applies
  `applySort` + `applyLimit`** (limit is global, applied before grouping).
  `ds.properties` = validated `order:` columns; `ds.groupedData` = groups
  `{entries, key}` (intra-group order = global sort; keyless group last).
- `entry.getValue('note.x' | 'file.x' | 'formula.x')` accepts string
  identifiers. Empty values are a **null-value singleton** (`toString() ===
  'null'`), not JS `null` — detect by identity (probe a nonexistent property).
- Bases **formulas/filters traverse nested structures**: `fields[0].name`,
  `note["a"][0]["b"]` work. Dotted *identifiers* (`note.a.0.b`) do NOT traverse
  (taken as a literal key).
- Context file: filters/formulas using `this.file` resolve against
  `controller.currentFile` — set it before `buildBasesContext` for
  embed-context views.

### 3.2 processFrontMatter (write path)
Verified: **preserves order** of top-level keys, nested object keys, ObjectList
items, and per-item key order (even when inconsistent between items); preserves
block scalars (`|`), value types and necessary quotes. Normalizes: **YAML
comments are deleted**, integer-like keys reordered numerically ("2","1" →
"1","2"), flow lists (`[a, b]`) rewritten as bullet lists, superfluous single
quotes removed. New keys are appended at the end. These normalizations go in
the migration doc; the order-preservation claim gets a canary test.

## 4. Repository layout

```
fileclass/
├── .claude/docs/ARCHITECTURE.md    # this file
├── manifest.json                   # id: "fileclass", minAppVersion: 1.13.2 (tested)
├── esbuild.config.mjs / tsconfig.json (strict) / package.json
├── main.ts                         # plugin entry, thin
├── src/
│   ├── globals.ts                  # getPlugin()/setPlugin() singleton (D7)
│   ├── engine/
│   │   ├── basesAdapter.ts         # DELIVERED, runtime-proven. Do not refactor. (§6)
│   │   ├── queryCache.ts           # parsed-Query cache keyed by .base path, invalidated on vault modify
│   │   └── objectPath.ts           # parse/get/set/insert/remove on ["a",0,"b"] paths (§8)
│   ├── schema/
│   │   ├── fileClass.ts            # parse fileClass notes (D3), inheritance (extends), excludes
│   │   ├── field.ts                # Field model: id, name, type, options, path
│   │   └── resolver.ts             # file → fileClasses → fields (binding priorities, §10)
│   ├── fields/                     # one module per field type (§7): settings UI + value modal + validator + renderer
│   ├── io/
│   │   ├── read.ts                 # frontmatter reads (getFileCache + objectPath)
│   │   └── write.ts                # processFrontMatter writes; single write per user action (D5)
│   ├── computed/
│   │   ├── lookups.ts              # §9
│   │   └── formulas.ts             # §9
│   ├── views/
│   │   ├── fileclassBasesView.ts   # registered custom Bases view with editable cells (§11)
│   │   └── baseFileGenerator.ts    # generate <fileClass>.base files (§11)
│   ├── ui/                         # modals, suggesters, field options menu, status icons
│   ├── settings/                   # settings tab + per-fileClass settings
│   ├── api.ts                      # public API (§12)
│   └── migration/audit.ts          # legacy option scanner (§13)
├── tests/
│   ├── unit/                       # vitest, pure logic (objectPath, schema resolver, validators, draft editor)
│   └── e2e/                        # CDP harness against a fixture vault (§14)
└── docs/                           # mkdocs (user documentation)
```

## 5. Schema layer

- fileClass notes live under `settings.classFilesPath`. Frontmatter carries
  `fields` (list of `{name, id, type, options, path}`), `extends`, `excludes`,
  `mapWithTag`, `tagNames`, `filesPaths`, `bookmarksGroups`, `version`, plus
  view options. **Port the parsing semantics from Metadata Menu** (D3), do not
  redesign. `path` encodes nesting (parent field ids joined with `____`).
- Inheritance: single `extends` chain with cycle guard; `excludes` removes
  inherited fields (same as MDM `getFileClassesAncestors`).
- Field options referencing queries change shape: anywhere MDM had
  `dvQueryString`, Fileclass uses `{ baseFile: string, viewName?: string }`
  (a `.base` path + view). Settings UIs offer a base picker + view dropdown
  (views listed via `listBaseViews` from the adapter).

## 6. Query engine rules

- Only `computed/`, `fields/` (File/MultiFile/Media candidates, List value
  sources) and `views/` may call the adapter — always through its public
  functions: `isBasesAvailable`, `listBaseViews`, `getBaseFiles`, `getBaseRows`.
- Every call goes through `queryCache` for the parsed Query when repeated
  (invalidate on `vault.on('modify')` of the `.base` file).
- Each adapter run is O(vault) (entry per file, like native Bases). Never call
  it per-target-file in loops — see the Lookup single-scan rule (§9).
- If `isBasesAvailable()` is false (Bases disabled or internals drifted):
  disable query-dependent features with a persistent Notice + settings banner;
  everything else (schema, typed input on scalar fields) keeps working.

## 7. Field types (port waves)

Wave A (phase 2): `Input`, `Number`, `Boolean`, `Select`, `Multi`, `Cycle`,
`Date`, `DateTime`, `Time`.
Wave B (phase 2): `File`, `MultiFile`, `Media`, `MultiMedia` — candidates =
`getBaseFiles(baseFile, viewName, currentFile.path)`; alias/display of
suggestions may use a base formula column via `getBaseRows` values.
Wave C (phase 2): `Object`, `ObjectList` (§8).
Wave D (phase 3): `Lookup`, `Formula` (§9).
Deferred (evaluate later, not in v1): `Canvas`, `CanvasGroup`, `CanvasGroupLink`,
`JSON`, `YAML` (frontmatter-only makes JSON/YAML largely redundant with Object).

Each field module ships: options settings UI, value input modal/suggester,
`validate(value, options)`, cell renderer for the custom view, doc page, unit
tests for the validator.

## 8. Object / ObjectList

- `objectPath.ts`: `parsePath("fields[0].name") → ["fields", 0, "name"]`,
  `get/set/insert/remove`. Path syntax deliberately matches Bases formula
  syntax (§3.1). ~50 lines, zero Obsidian imports, fully unit-tested.
- Draft editor (D5): recursive modal driven by the schema. Add/remove/reorder
  ObjectList items. `Cancel` = no write ever happened. `Save` = full-draft
  validation, then one `processFrontMatter` write of the mutated clone.
- Reading nested values for display/index: `get(frontmatter, path)` — no file
  parsing.

## 9. Computed fields

**Lookup** (persisted reverse relations):
- Definition: `{ baseFile, viewName, targetFieldName, outputType, ... }`.
  Output types and rendering ported from MDM (`LinksList`, `BuiltinSummarizing`
  (count/sum/average...), `CustomList`, `CustomSummarizing`) — custom functions
  receive `(rows, { file, app })` where `rows` come from `getBaseRows` (NOT
  dataview `pages`; document the migration).
- **Single-scan rule**: one `getBaseRows` run per lookup *definition* per
  recalc cycle; group results by `targetFieldName` value (link path) to fan out
  to host files — same pattern as MDM `resolveLookups`, different engine.
- Values written into frontmatter via `io/write` (that's the point: persisted,
  ecosystem-readable).

**Formula** (persisted computed columns):
- The formula is a **Bases formula expression** (same language the user writes
  in `.base` files). Evaluation: build a context with the formula via the
  adapter (`getBaseRows` on a synthetic query, or a dedicated
  `evaluateFormula(app, expression, file)` helper added to the adapter if
  needed — if added, verify + canary-test it like the rest).
- No `dv` access inside formulas; cross-file aggregation is Lookup's job.

**Recalc & status**: recompute on debounced `metadataCache.on('resolved')`;
statuses limited to `upToDate | changed | error` shown on the field action
icon; `autoUpdate` per field, `isAutoCalculationEnabled` global — port the UX,
drop MDM's `mayHaveChanged` heuristics and all dataview-event plumbing.

## 10. Index

Slim rewrite of MDM's `FieldIndex` keeping ONLY:
- fileClass registry (parse all notes under `classFilesPath`), ancestors, fields
  per fileClass;
- file → fileClass mapping with MDM's priority order: frontmatter alias >
  tag match > path match > bookmark group match > (base-view match, replaces
  fileClassQueries) > global fileClass > preset fields;
- rebuild on `metadataCache.on('resolved')` (debounced) and on fileClass file
  changes; `metadata-menu:indexed`-style event renamed `fileclass:indexed`.

Dropped entirely: dataview listeners, `dVRelatedFieldsToUpdate`, IndexedDB
(`src/db`), ExistingField location index (frontmatter reads are direct),
canvas file tracking (deferred with Canvas fields).

## 11. Views

- `registerFileclassView` (adapter): register view id `fileclass-table` on the bases plugin
  instance (`instance.registerView(id, {name: "Fileclass table", icon, factory})`,
  observed shape `{name, icon, factory(controller, containerEl), options}`).
  The factory builds a table on `view.data` (dataset) where each cell is
  editable through the field managers (schema known via the resolver). This
  replaces Metadata Menu's FileClassView **and keeps in-cell editing**.
  Registration/deregistration on plugin load/unload; feature-detect like D4
  (this is adapter territory: expose `registerFileclassView(app, spec)` from
  basesAdapter).
- `baseFileGenerator`: command "Create base for fileClass" → writes
  `<basesFolder>/<FileClass>.base` with `filters: fileClass == "X"` (respect
  `settings.fileClassAlias`), `order:` = the fileClass fields, one `table` view
  using `fileclass-table` type. Never overwrite an existing file without
  confirmation.
- Embeds: users embed bases natively (```` ```base ````); no custom code block.

## 12. Public API (`plugin.api`)

Keep MDM-compatible names and signatures where semantics survive:
`getValues`, `getValuesForIndexedPath` (path = objectPath string now),
`fileFields`, `namedFileFields`, `insertMissingFields`, `postValues`,
`postNamedFieldsValues`. NOT ported: `fieldModifier` (dataview-only).
Document differences in `docs/api.md`.

## 13. Migration from Metadata Menu

- Command "Audit fileClasses": scans fileClasses + preset fields for
  `dvQueryString` / `customRendering` / `customSorting` / `customListFunction`
  / `customSummarizingFunction` / fileClassQueries; produces a report note
  listing each occurrence with the target replacement (`baseFile`+`viewName`,
  formula column, `(rows)` function) and generates skeleton `.base` files with
  TODO filters (JS → Bases filters is not auto-translatable).
- Migration doc page: who should migrate (frontmatter users) vs stay on MDM
  (inline fields, dataview virtual props like `file.tasks`), plus the
  processFrontMatter normalizations (§3.2).

## 14. Testing

- **Unit (vitest, no Obsidian)**: objectPath, schema resolver (inheritance,
  excludes, binding priorities), field validators, draft editor logic, lookup
  grouping, audit scanner. Run in CI on every push.
- **E2E (CDP)**: harness from `~/obsidian-bases-probe/cdp.js` pattern — a Node
  script connects to a dev Obsidian (`--remote-debugging-port=9222`) opened on
  `tests/e2e/fixture-vault/`, drives the plugin via `Runtime.evaluate`, asserts
  on vault file contents. Scenarios: each field type write, draft editor
  atomicity, lookup/formula recalc, base generation.
- **Canary tests** (run at every Obsidian upgrade, part of e2e): (1) the
  basesAdapter verification protocol — a known fixture `.base` returns the
  expected file set and sorted/grouped rows; (2) processFrontMatter
  order-preservation (§3.2). If a canary fails on a new Obsidian version,
  `basesAdapter` is the only file expected to change.

## 15. Delivery phases (each = code + unit tests + doc page)

- **P0 Foundations**: scaffold following the official
  [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
  conventions — replicate its files (manifest.json, versions.json,
  version-bump.mjs, esbuild.config.mjs, release workflow, .gitignore for
  build artifacts), do NOT clone the repo (this repo already has its own
  history). Deviations from the template: full `strict` tsconfig, vitest,
  code under `src/` with a thin root `main.ts`. Then: globals,
  objectPath, queryCache, adapter wired with feature detection, e2e harness
  skeleton + canary tests, mkdocs skeleton with positioning page.
- **P1 Schema (read-only)**: fileClass parsing, inheritance, resolver/index,
  "fileclass:indexed" event, fileClass chooser UI.
- **P2 Fields & input**: waves A→C, `io/write`, insert-missing-fields command,
  field options menus, draft editor.
- **P3 Computed**: lookups (single-scan), formulas (Bases expressions),
  statuses, recalc triggers.
- **P4 Views**: fileclass-table custom Bases view with editable cells, base
  file generator command.
- **P5 Migration & API**: public API, audit command, migration docs, MDM
  deprecation banner PR (separate repo).

## 16. Coding conventions

- TypeScript strict; no `any` outside `src/engine/basesAdapter.ts` (private
  internals are structurally typed there, `any` allowed at the boundary).
- `getPlugin()` singleton (D7); adapter and objectPath take explicit params
  (pure, testable).
- No new dependency without necessity; UI built on obsidian API primitives.
- English for code, comments, docs. Conventional commits.
- Every thrown error visible to users goes through a `Notice` with actionable
  wording.

## 17. Known risks

| Risk | Mitigation |
|------|------------|
| Bases internals drift on Obsidian update | D4 isolation + canary tests; only basesAdapter changes; graceful degradation path |
| O(vault) per query run on huge vaults | queryCache, single-scan lookups, debounced recalc; benchmark fixture in e2e |
| Users with YAML comments / custom formatting | documented normalization (§3.2), first-write warning in migration doc |
| Legacy fileClasses with dv options | audit command + report, options ignored (never crash on them) |

## 18. Reference material

- Metadata Menu source (normative for fileClass format & UX to port):
  `/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/metadatamenu/`
- Bases headless investigation (findings + proven scripts):
  `~/obsidian-bases-probe/findings.md`, `getBaseFiles.inapp.js`,
  `getBaseRows.inapp.js`, `getBaseRows.cdp.js` (CDP harness example: `cdp.js`)
- Dev vault with real fileClasses and `.base` files for manual testing:
  `/Users/mdelobel/Obsidian-Dev` (bases under `Settings/bases/`, fileClasses
  under `Settings/fileClasses/`)
