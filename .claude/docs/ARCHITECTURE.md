# Fileclass — Architecture & Implementation Plan

> **Read this file entirely before writing any code.** It encodes decisions and
> runtime-verified facts established during the design phase (July 2026). Do not
> re-litigate the decisions in §2; do not "improve" `src/engine/basesAdapter.ts`
> without re-running its verification protocol (§14).

## 1. What this plugin is

**Fileclass** is the schema and data-quality layer for Obsidian vaults: typed,
validated, per-note-type property schemas ("fileClasses") with guided input and
nested objects — using the **core Bases plugin as query/view engine**. It is the
successor of [Metadata Menu](https://github.com/mdelobelle/metadatamenu)
(same author). Metadata Menu goes into maintenance mode; users relying on
dataview inline fields stay there.

**Out of scope (deliberate):** *computed* fields — **Lookup** (reverse relations)
and **Formula** (computed columns). They don't validate user input; they derive
and write values from *other* notes/fields, which is a different concern and is
better served by Bases views (and, for persistence, other tooling). Fileclass is
the schema + guided-input + nested-editing layer, not a computation engine. See
§9.

Positioning vs core Obsidian:
- core **Properties** types are flat and vault-global; no per-class schema, no
  constrained values, no relations, no nested editing.
- core **Bases** queries/views properties (including nested ones) but cannot
  edit nested values and has no schema.
- **Fileclass** = fileClass schemas (≈ table schema), File/MultiFile fields
  constrained by a Base view (≈ foreign key), Select (≈ enum), Object/ObjectList
  (nested typed structures with a real editor). Reverse relations and computed
  columns are **out of scope** (§9).

## 2. Non-negotiable design decisions

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | **No dataview dependency, ever.** | Query engine = Bases via `src/engine/basesAdapter.ts`. `dvQueryString`/`customRendering`/`customSorting` options from legacy fileClasses are ignored silently (§13). |
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
the user docs; the order-preservation claim gets a canary test.

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
│   ├── views/
│   │   ├── fileclassTableView.ts   # registered custom Bases view with editable cells + validation columns (§11)
│   │   ├── baseFileGenerator.ts    # generate <fileClass>.base files (§11)
│   │   └── baseSync.ts             # one-way explicit fileClass → base sync (§11)
│   ├── ui/                         # modals, suggesters, field options menu, status icons
│   ├── settings/                   # settings tab + per-fileClass settings
│   └── api/
│       ├── fileclassApi.ts         # public API surface (§12)
│       └── filter.ts               # pure where-filter predicate (§12)
├── tests/
│   ├── unit/                       # vitest, pure logic (objectPath, schema resolver, validators, draft editor)
│   └── e2e/                        # CDP harness against a fixture vault (§14)
└── docs/                           # Hugo site (user documentation)
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

- Only `fields/` (File/MultiFile/Media candidates, List value sources) and
  `views/` may call the adapter — always through its public functions:
  `isBasesAvailable`, `listBaseViews`, `getBaseFiles`, `getBaseRows`.
- Every call goes through `queryCache` for the parsed Query when repeated
  (invalidate on `vault.on('modify')` of the `.base` file).
- Each adapter run is O(vault) (entry per file, like native Bases). Never call
  it per-target-file in loops.
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
Wave D (post-P3): `JSON`, `YAML` — free-form nested value edited as monospace
text, validated by the parser (`JSON.parse` / Obsidian `parseYaml`). Pure
serialize/parse in `src/fields/structuredText.ts` with an injected YAML codec;
the escape hatch for structures Object/ObjectList don't model.
Out of scope: `Lookup`, `Formula` — computed types, not validated input (§9).
Legacy fileClasses may still declare them: they parse and display read-only, but
have no input, no settings UI, and are not offered when authoring a fileClass.
Planned (dedicated feature, §9.1): `Canvas`, `CanvasGroup`, `CanvasGroupLink`.

**Required (landed):** a common `required` flag on any field's options (schema
editor toggle, `src/ui/fieldDefModal.ts`). Empty values stay valid *unless*
`required` is set — `isRequired`/`validateField` (`src/fields/validate.ts`)
report a violation for an empty required field. Enforced uniformly: the
validation columns (§11), the API/CLI `validate`, and every write path.

Each field module ships: options settings UI, value input modal/suggester,
`validate(value, options)`, cell renderer for the custom view, doc page, unit
tests for the validator.

### 7.1 Proposed new field types (design discussion, July 2026)

Seven proposals filed as issues on `mdelobelle/fileclass` after triaging
Metadata Menu's open field-type requests (mm = metadatamenu issue). All respect
the field contract above: a typed scalar/structured value with guided input +
validation, frontmatter-only, no computation (§9). **None is scheduled into a
delivery phase yet** — these record the accepted design so the eventual
implementation doesn't re-litigate it.

| Type / change | Issue | Storage | Dep | Key decisions |
|---|---|---|---|---|
| `template` **option** on `Input` | #27 (mm #304) | scalar (rendered string) | — | Port MDM's `options.template`: placeholders `{{name}}` → text sub-input, `{{name:["a","b"]}}` → dropdown, live "Result preview". An **option, not a new type**. **Implemented** (`src/fields/inputTemplate.ts` pure parser/renderer; `TemplateInputModal` in `valueModals.ts`; Input case in `optionsDraft`/`fieldOptionsSettings`/`fieldActions`; `inputTemplate()` accessor in `options.ts`). |
| `MultiInput` type | #28 (mm #547) | YAML list | — | Multi-cardinality Input that **reuses** the `template` option. **Depends on #27.** Convention-consistent with `File`/`MultiFile`. **Implemented**: added to `FIELD_TYPES`/`LIST_TYPES`/`SUPPORTED_INPUT_TYPES`; `MultiInputEditorModal` (add/remove/reorder, delegates each item to `TemplateInputModal`/`PromptModal`) in `valueModals.ts`; reuses Input's template option in `optionsDraft`/`fieldOptionsSettings`; `validateField` requires a list of scalar items; blank items dropped on save. |
| ~~`Recurrence` type~~ | #29 — **DROPPED** | — | — | **Not shipped** (issue #29 closed *not planned*). RFC 5545 RRULE + `rrule` dep was overkill for the only real use case (spaced-repetition date advancing). Superseded by the `Duration`/`CycleDuration` cycling below — same workflow, **zero dep**. Kept here as the record of why. |
| `Duration` type | #30 (mm #751) | RFC 5545 `DURATION` scalar | — (**zero dep**) | **Implemented** without `moment`: the DURATION grammar is small enough to parse/build with a regex and UTC Date math (`src/fields/duration.ts`, pure & unit-tested). Builder (`DurationInputModal`) has W/D/H/M/S spinners; weeks stay standalone (`P2W`) else fold into days (`P{d}DT…`) to stay RFC-valid. Compact human preview (`1d 6h`). `validateField` uses the pure `isValidDuration`. |
| `CycleDuration` type | (folds #29's workflow into #30) | YAML list of DURATIONs | — | The list counterpart of `Duration` (ordered interval sequence stored in the note). `CycleDurationEditorModal` add/remove/reorder, each item via `DurationInputModal`. **Drives the spaced-repetition mechanic**: a Date/DateTime field's option `nextIntervalField` names a `Duration`/`CycleDuration` field; the date editor's **"Set next date"** button computes `current + head interval`, writes it, and for a CycleDuration **rotates the list head→tail** (wraps after the last) — one immediate `processFrontMatter` write (`nextDateProvider` in `fieldActions`). Not Formula/Lookup: manual, single-note, no auto-recompute. Both `Duration` and `CycleDuration` accept **free-text** value entry (ISO or human `1h 30m`, `parseDurationInput`) synced with W/D/H/M/S spinners, and an optional schema **`presets`** list surfaced as quick picks (one-click button / tap-to-append chips); values stay per-note. Named `CycleDuration` (not `MultiDuration`) because order + rotation are its essence, echoing the `Cycle` family. |
| `Location` type | #31 | `"lat,lon"` scalar | — | Matches the core **Bases Map view** text format. **Implemented** (`src/fields/location.ts` pure parse/validate/format/`mapUrl`; `LocationInputModal`): two range-validated number inputs (lat ∈ ±90, lon ∈ ±180) + paste + an "Open in map" external browser link. **No embedded map picker** — external tiles = network, against no-external-dep and Obsidian review guidelines. An in-app OSM `<webview>` picker was prototyped on request and **reverted**: the Electron `<webview>` tag (deprecated, especially in a popout window) **crashed Obsidian**. Lesson recorded: do not use `<webview>`; keyboard/paste + an external link is the safe, cross-platform, store-compliant path. |
| `Icon` type | #32 | bare icon id scalar | — (`getIconIds`/`setIcon`) | Select over an **extensible icon-bank provider registry** (Lucide first), field option `iconSource`. The bank is a **picker concern, not storage**: Obsidian's registry is global with unique ids, so storage stays the bare id ⇒ Bases-Map `icon` interop. Generalizes the fileClass-icon picker (§20.1). Rejected "one type per bank". |
| `Color` type | #33 | CSS color scalar | — (native `<input type=color>`) | Same **palette-source provider** pattern as Icon: default = canvas palette (reuse `canvasOptionsSettings.ts` `CANVAS_COLORS`/`fileclass-color-chip`), option `colorSource`, + custom hex. Storage stays a raw CSS value ⇒ Bases-Map `color` interop. |

**Bases Map view interop (decided):** Fileclass **does not generate map views**.
If a user names fields `coordinates` / `icon` / `color`, the core Bases Map view
picks them up on its own; otherwise the note is simply absent from it. The
`Location`/`Icon`/`Color` types only make those properties easy to enter
correctly. View generation is out of the plugin's purpose.

**Rejected as out of scope** (mm requests that violate §9): AI Field (mm #607 —
computed via LLM + queries), Relationship/reverse-lookup combo (mm #222 =
Lookup), classes-as-fields / UML aggregation (mm #611 = Lookup). **Better as
options on existing types, not new types:** email/format on `Input` (mm #197),
label≠value on `Select` (mm #341), link-to-nonexistent on `File` (mm #193).

## 8. Object / ObjectList

- `objectPath.ts`: `parsePath("fields[0].name") → ["fields", 0, "name"]`,
  `get/set/insert/remove`. Path syntax deliberately matches Bases formula
  syntax (§3.1). ~50 lines, zero Obsidian imports, fully unit-tested.
- Draft editor (D5): recursive modal driven by the schema. Add/remove/reorder
  ObjectList items. `Cancel` = no write ever happened. `Save` = full-draft
  validation, then one `processFrontMatter` write of the mutated clone.
- Reading nested values for display/index: `get(frontmatter, path)` — no file
  parsing.

## 9. Computed fields — out of scope

**Decision (July 2026):** `Lookup` (reverse relations) and `Formula` (computed
columns) are **not** part of Fileclass. Rationale:

- They are not field **validation/input** — Fileclass's job is a typed schema
  with guided input and nested editing. Lookup/Formula instead *derive* a value
  from *other* notes/fields and write it back; that is a distinct concern (a
  computation/automation engine), with its own recalc, status, and dependency
  problems.
- The reading side is already well served by **Bases views** (aggregations,
  reverse links, formula columns) without persisting anything. Persisting derived
  values, when needed, is better handled by dedicated tooling than bolted onto a
  schema layer.
- Evaluating a Bases *formula expression* headless requires fragile, unstable
  private internals (formula compilation / query-cache side effects observed
  during prototyping) — a poor cost/benefit for this plugin.

**Consequences:** no `computed/` module, no Lookup/Formula input, settings, recalc,
commands, or status. Legacy fileClasses declaring such fields still load: the
field parses and its value displays read-only (never coerced, never crashed), but
it is inert and not offered when authoring a fileClass (§7).

### 9.1 Canvas fields — planned, NOT the same as computed fields

`Canvas`, `CanvasGroup`, `CanvasGroupLink` were initially lumped with
Lookup/Formula; a code analysis of MDM showed they are a **different mechanism**
and the two exclusion reasons above do **not** apply:

| Axis | Lookup / Formula | Canvas* |
|------|------------------|---------|
| Source | user DataviewJS query / JS expression | native `.canvas` file (JSON graph) |
| External dependency | **Dataview (hard)** | **none** (`obsidian/canvas` + `vault.read`) |
| Logic | open-ended, user-authored | **fixed**: `canvasPath` + direction / group |
| Trigger | `dataview:metadata-change` (any metadata) | `vault.on("modify")` on a `.canvas` (narrow) |
| Bases equivalent | **yes** (reverse links, formula columns) | **no** — Bases doesn't index canvas adjacency |

So excluding Lookup/Formula loses nothing (Bases covers it, and they need the
rejected Dataview dep, D1). Excluding Canvas* loses a capability **with no
substitute**. Decision: **implement** as a dedicated feature (chosen over
out-of-scope), scheduled **after JSON/YAML**.

**Implemented** (`src/fields/canvas/`): a small canvas→frontmatter sync, no Dataview:
- pure `canvasGraph.ts` — parse + traversal (oriented edges, color/side/label
  filters, geometric group membership); fully unit-tested;
- `canvasEngine.ts` — a Component watching `.canvas` via
  `vault.on("modify"|"create"|"delete"|"rename")` (debounced) and re-syncing on
  the index event; parses the canvas, computes each note's Canvas-family field
  values, **diffs vs current** (writes only on change → no loop), writes with the
  single-write path (D5), and clears fields on notes that dropped out
  (`lastNotes` map, like MDM's `canvasLastFiles`);
- options `canvasPath` + `direction` in the schema editor (advanced
  color/side/label filters preserved and honored if present);
- gated by the **enableCanvasEngine** setting (it auto-writes frontmatter, the
  one surface that does).

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
canvas file tracking (comes with the planned Canvas engine, §9.1).

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
- **Validation columns (landed):** the `fileclass-table` view can prepend a
  `valid` (✓/✗) column and append an `errors` column, validating **all** of each
  note's root fields (not just shown columns) via `validateField`; allowed values
  are resolved once per render and cached. Gated by
  `settings.enableValidationColumns` (default on).
- `baseFileGenerator`: command "Create base for fileClass" → writes
  `<basesFolder>/<FileClass>.base` with `filters: fileClass == "X"` (respect
  `settings.fileClassAlias`), `order:` = the fileClass fields, one `table` view
  using `fileclass-table` type. Never overwrite an existing file without
  confirmation.
- Embeds: users embed bases natively (```` ```base ````); no custom code block.

## 12. Public API + CLI/TUI

**Goal:** a JSON-serializable public surface reusable from Obsidian's own CLI
(`obsidian eval "…"`, which runs JS in the live app — reachability + JSON
round-trip verified) and a future standalone `fileclass` CLI/TUI wrapper. Not a
one-to-one port of Metadata Menu's `plugin.api`.

**API-1 (landed):** `src/api/fileclassApi.ts` → `createFileclassApi(plugin)`,
exposed as `plugin.api` (`app.plugins.plugins.fileclass.api`, `version` "1.0").
Thin wiring over the existing engine (index, `validateField`, `io/read`+`write`,
`resolveFieldValues`, `describeField`, `insertMissingFields`), JSON in/out,
non-interactive (`setValue` validates then writes — strict list membership, no
modal), structured `WriteResult`s. Surface: `listFileClasses`, `getSchema`,
`explain`, `getFields`, `getValue`, `allowedValues`, `validate(scope?)` (empty
scope = whole vault), `setValue`, `clearValue`, `insertMissing`. Obsidian-coupled
→ verified live via CDP rather than unit-tested (the wired core is unit-tested).

**API-2 (landed):** `listNotes(fileClass, { columns?, where?, limit? })` and
`setValueWhere(fileClass, field, value, where?)` — bulk over a fileClass's notes.
The filter predicate is pure (`src/api/filter.ts`, unit-tested): `is`/`isNot`
(string compare), `contains` (array membership / substring), `isEmpty`/
`isNotEmpty`. `setValueWhere` validates each write (strict), skips no-ops, and
aggregates a `BulkResult`. Verified live via CDP (no-op and out-of-list bulk both
wrote nothing).

**CLI/TUI (landed, separate repo):** a standalone `fileclass` binary (Node +
React/ink) shelling out to `obsidian eval` via a small transport, over the same
API. It lives in its **own repository** — `mdelobelle/fileclass-cli` — NOT in
this plugin repo: it uses Node built-ins (fs/os/path/child_process) that the
Obsidian plugin review linter (rightly) rejects for a mobile-capable plugin
bundle, and it is never part of what Obsidian downloads. Commands: `fileclasses`,
`schema`, `explain`,
`list`, `get`, `set`, `validate` (exit 1 on any violation — CI-friendly),
dry-run-by-default `set-where`, plus `tui` (interactive browse + typed editing +
inline validation status). Vault targeting: `--vault` > `FILECLASS_VAULT` >
`fileclass use` persisted default (`~/.config/fileclass/config.json`) > active
vault; every command echoes `vault: <name>` to stderr. `--json` on any command.
Obsidian-coupled → verified live rather than unit-tested (the pure `where` filter
and formatting helpers are unit-tested).

**Next (optional):** a schema-authoring API and a no-app CI mode.

## 13. Legacy fileClass options

No migration tooling ships, and the once-considered **audit command is dropped**
(decision July 2026): users migrated their fileClass **format** to Metadata
Menu's current schema long ago. The only remnant is dataview-era *option* keys
(`dvQueryString` / `customRendering` / `customSorting` / `customListFunction` /
`customSummarizingFunction` / fileClassQueries). Per D1 these are **ignored
silently** and never crash the index (§17); new link fields use
`{ baseFile, viewName }` instead.

The processFrontMatter normalizations (§3.2) are documented for users in the
fields/user docs (first-write warning), not in a migration guide.

## 14. Testing

- **Unit (vitest, no Obsidian)**: objectPath, schema resolver (inheritance,
  excludes, binding priorities), field validators, draft editor logic. Run in CI
  on every push.
- **E2E (CDP)**: harness from `~/obsidian-bases-probe/cdp.js` pattern — a Node
  script connects to a dev Obsidian (`--remote-debugging-port=9222`) opened on
  `tests/e2e/fixture-vault/`, drives the plugin via `Runtime.evaluate`, asserts
  on vault file contents. Scenarios: each field type write, draft editor
  atomicity, base generation.
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
  skeleton + canary tests, Hugo docs skeleton with positioning page.
- **P1 Schema (read-only)**: fileClass parsing, inheritance, resolver/index,
  "fileclass:indexed" event, fileClass chooser UI.
- **P2 Fields & input**: waves A→C, `io/write`, insert-missing-fields command,
  field options menus, draft editor.
- **P2-bis Field UI surfaces** (§19): reach editing from the UI, not just
  commands. Three slices — (1) note-fields modal + file/editor context menus;
  (2) field indicator in tab header, file explorer, bookmarks; (3) indicator on
  internal links (reading + live preview + backlinks) and the Bases first
  column. All editing reuses the P2 dispatcher; the DOM-injection layer is
  isolated and feature-flagged per surface.
- **P2-ter fileClass schema editor** (§20): author a fileClass's own definition
  (options + field definitions), the write-side counterpart of P1's read-only
  schema and the home of the deferred per-type "options settings UI" (§7).
  Modal-based (no dedicated view). Three slices — (1) options editor + add/
  remove/reorder fields; (2) per-type option settings (Number/Date/Boolean,
  Select/Cycle/Multi with base-picker); (3) File/Media + Object/ObjectList.
- **P3 Views**: base file generator + explicit base sync (done, §11); then the
  fileclass-table custom Bases view with editable cells + validation columns.
  *(Computed fields — Lookup/Formula — are out of scope; see §9.)*
- **P4 Terminal (landed)**: public API (API-1 + API-2), the `fileclass` CLI, and
  the ink TUI (§12); `required` fields + validation columns (§7, §11). No
  migration tooling (§13).

## 16. Coding conventions

- TypeScript strict; **no `any` anywhere** — the Obsidian review linter forbids
  it (and disabling the rule). Private Bases/Obsidian internals are reached only
  in `src/engine/basesAdapter.ts`, structurally typed via `unknown` casts to
  minimal interfaces (`AppInternals`, `BasesInstance`, …).
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
| O(vault) per query run on huge vaults | queryCache, debounced reads; benchmark fixture in e2e |
| Users with YAML comments / custom formatting | documented normalization (§3.2), first-write warning in user docs |
| Legacy fileClasses with dv options | options ignored silently (never crash on them, §13) |
| DOM-injected indicators drift on Obsidian update (§19) | isolate the injection layer; per-surface settings flags; defensive selectors that no-op on a miss; core features (modal, menus, commands) never depend on it |

## 18. Reference material

- Metadata Menu source (normative for fileClass format & UX to port):
  `/Users/mdelobel/Obsidian-Dev/.obsidian/plugins/metadatamenu/`
- Bases headless investigation (findings + proven scripts):
  `~/obsidian-bases-probe/findings.md`, `getBaseFiles.inapp.js`,
  `getBaseRows.inapp.js`, `getBaseRows.cdp.js` (CDP harness example: `cdp.js`)
- Dev vault with real fileClasses and `.base` files for manual testing:
  `/Users/mdelobel/Obsidian-Dev` (bases under `Settings/bases/`, fileClasses
  under `Settings/fileClasses/`)

## 19. Field UI surfaces (P2-bis)

Ports Metadata Menu's in-UI editing entry points (`src/components/ExtraButton.ts`,
`ContextMenu.ts`, `src/options/OptionsList.ts`, `linkAttributes.ts`) onto the P2
frontmatter engine. **No new write paths**: every edit routes through the P2
dispatcher (`promptFieldValue`/`updateField`, one `processFrontMatter` write, D5).

### 19.1 Note-fields modal (`src/ui/noteFieldsModal.ts`)
- The single hub for a file's fields: lists the note's resolved **root** fields
  (`index.getFields`), each row = name + current value (`displayValue`) + **Edit**
  (→ `updateField`) + **Clear** (→ `clearField`). Header actions: **Add
  fileClass**, **Insert missing fields**. Nested fields are reached via their
  parent's Object/ObjectList editor (already built in P2 Wave C).
- Opened from every surface below and from a command
  (`fileclass:manage-note-fields`).

### 19.2 Single-property modifier
- "The button to modify a property" = the per-row **Edit** in 19.1, plus a
  direct path: a `fileclass:update-field` already exists (P2). Injecting a button
  into Obsidian's **core Properties widget** is a stretch goal (fragile, §19.5);
  the modal + menus cover the need without it.

### 19.3 Context menus (`src/ui/contextMenu.ts`)
- Register `file-menu` and `editor-menu` (MDM parity). Items: **Manage note
  fields** (→ 19.1), **Add fileClass**, **Insert missing fields**, **Update a
  field** (→ `pickAndUpdateField`). For a fileClass note: a **Manage fields
  schema** entry (wired when the schema editor lands).
- Covers file-explorer right-click, tab right-click, and the editor. Internal-
  link right-click support depends on Obsidian firing `file-menu` for links —
  verify at build time; otherwise the link indicator (19.4) is the entry point.

### 19.4 Field indicator (`src/ui/indicator/`) — the fragile boundary
- A small clickable icon injected next to a file's name that opens 19.1 for that
  file. **Default: icon only** (no values shown) — the lightest, most robust
  option; showing configured field values beside it (MDM's "extra attributes")
  is a later opt-in. Surfaces requested: **tab header, file explorer, bookmark
  explorer, internal links** (reading view + Live Preview + backlinks), and the
  **Bases first column** (`.internal-link` cells, as MDM already does for
  `bases`).
- Implementation mirrors MDM `ExtraButton`: per-view-type **MutationObservers**
  (`.nav-file-title-content` for explorer/bookmarks, `.internal-link` for
  markdown/bases/backlinks), a **markdown post-processor** for reading view, and
  an **editor extension** for Live Preview links. Updates are debounced and keyed
  off `fileclass:indexed` + `metadataCache.on('changed')`.
- **Isolation like the adapter (D4-style)**: all DOM injection lives under
  `src/ui/indicator/`; observers are registered via `register*` and torn down on
  unload; a missed selector no-ops (never throws). Each surface has a settings
  flag (`enableTabHeader`, `enableFileExplorer`, `enableBookmarks`,
  `enableInlineLinks`, `enableBacklinks`, `enableBases`), all default-off-safe.
- The future `fileclass-table` custom view (P4) renders the indicator natively —
  no observer needed there; the `.internal-link` observer covers **native** Bases
  tables.

### 19.5 Slices & DoD
- **P2-bis.1** — note-fields modal + context menus + settings flags. Low-risk,
  high-value; unit tests for the pure "which fields / how displayed" logic.
- **P2-bis.2** — indicator in tab header, file explorer, bookmarks.
- **P2-bis.3** — indicator on internal links (reading + Live Preview +
  backlinks) and the Bases first column.
- Each slice = code + tests (pure logic units; DOM injection verified via the
  e2e/CDP harness or manual on the dev vault) + a doc page. The indicator layer
  is a known-fragile boundary (§17): if a surface breaks on a new Obsidian, only
  its module changes and the core (modal, menus, commands) keeps working.

### 19.6 Property editor buttons (`src/ui/propertyEditButtons.ts`)
An edit button injected between the key and value of each native Properties row
whose key (case-insensitively) is an editable root field of the note's fileClass;
clicking opens `updateField` (typed input + validation). No Obsidian API exists
for this (`metadataTypeManager.registeredTypeWidgets` is per-property-*type*
value rendering, global and private — not per-field) — so it's DOM injection,
same fragile-boundary treatment as the indicators (§19.4): MutationObservers on
markdown/file-properties leaves, dedup-guarded, behind the enablePropertyEditButtons
setting, removed on unload. Canvas cards are skipped (row not in a real
properties editor); auto-maintained (Canvas) and computed types get no button.

## 20. fileClass schema editor (P2-ter)

Authoring the fileClass itself — the write-side counterpart of P1's read-only
parsing (§5) — ported from Metadata Menu's `fileClassSettingsView` and
`fileClassFieldsView`. **Modal-based** (no dedicated leaf view): lighter, and it
reuses the P2 modal/suggester infra. Every change is written to the fileClass
note's frontmatter through a single `processFrontMatter` (D2/D5); after each
write the index rebuilds and fires `fileclass:indexed`.

### 20.1 fileClass options editor (`src/settings/fileClassEditor.ts`)
- A modal editing a fileClass's options: `limit`, `icon` (Lucide picker),
  `extends` (parent — a fileClass suggester with cycle guard), `excludes`,
  `mapWithTag`, `tagNames`, `filesPaths`, `bookmarksGroups`, `fieldsOrder`.
  Mirrors MDM `updateOptions`; writes only the option keys, preserving `fields`.

### 20.2 fileClass fields manager
- Lists the fileClass's **own** fields (inherited ones shown read-only, from the
  parent). Add / edit / remove / reorder field **definitions** (name, id, type,
  options, path). Reorder maintains a clean hierarchy for nested fields
  (`buildSortedAttributes`/`moveField` semantics). Ids are generated for new
  fields; edits mutate the matching `fields[]` entry via processFrontMatter
  (never regenerate the array — preserve unknown keys, like D5).

### 20.3 Per-type option settings (`src/fields/<type>` settings modals)
- The "options settings UI" §7 defers to here. One settings component per field
  type, opened from the fields manager when adding/editing a field:
  - **Number** min/max/step; **Date/DateTime/Time** format + default-as-link;
    **Boolean** none.
  - **Select/Cycle/Multi** values source: inline list editor, a note path, or a
    **base view** (`{ baseFile, viewName }`) chosen with a base-picker
    (`listBaseViews` from the adapter) — replacing MDM's `dvQueryString`.
  - **File/MultiFile/Media/MultiMedia** base-picker + view + `displayColumn` +
    `embed` (Media).
  - **Object/ObjectList** manage child fields (recurse into 20.2 with the child
    `path`).
- Each type's settings component ships next to its value logic in `src/fields/`,
  completing the §7 "each field module ships …" contract.

### 20.4 Entry points & slices
- Reached from the context menu's **Manage fields schema** (§19.3), a command,
  and — on a **fileClass note** — the field indicator itself (§19.4): in the tab
  header / file explorer its icon opens the schema editor instead of the
  note-fields modal.
- Slices: **P2-ter.1** options editor + add/remove/reorder (type+name only);
  **P2-ter.2** per-type settings for Wave A + list sources (base-picker);
  **P2-ter.3** File/Media + Object/ObjectList. Each = code + unit tests (pure
  option (de)serialization, id generation, reorder/hierarchy) + a doc page.
