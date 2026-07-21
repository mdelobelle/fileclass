# Changelog

All notable changes to Fileclass are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

First development cycle — the successor to Metadata Menu, built on the core
**Bases** plugin, frontmatter-only, with no Dataview dependency.

### Schema

- fileClass notes (Metadata Menu's format, unchanged), inheritance (`extends`,
  `excludes`), binding by alias / tag / path / bookmark group / Base view /
  global default.
- Read-only resolver + index; `fileclass:indexed` event.
- **fileClass schema editor** — author options and field definitions from the UI.
- **Create a fileClass** command (creates the note and opens its schema editor).

### Fields & typed input

- Types: Input, Number (spinner), Boolean (toggle), Select, Cycle, Multi,
  Date/DateTime/Time (native picker + Today/Clear + link toggle + Natural
  Language Dates support), File/MultiFile, Media/MultiMedia (candidates from a
  Base view), Object/ObjectList (draft editor), JSON/YAML (parser-validated).
- **Canvas / CanvasGroup / CanvasGroupLink** — auto-maintained from a `.canvas`
  file's graph (edge/node/group color/side/label filters; "matching files" via a
  Base view). No Dataview.
- Object/ObjectList **display templates** (`{{field}}`, `{{date|FORMAT}}`, nested,
  ranked lists).
- `Lookup`/`Formula` are out of scope (use Bases views); their fields load and
  display read-only.

### UI surfaces

- Note-fields modal: compact rows, per-type icons, per-type quick actions
  (Boolean toggle, Cycle next), clickable links + indicators, and a fileClass
  inheritance breadcrumb footer that highlights a fileClass's fields on hover.
- Field indicators in tab header, file explorer, bookmarks, backlinks, Bases
  first column, and after internal links (reading view + Live Preview).
- **Edit buttons in the native Properties editor** (per-field type icon → typed
  input).
- Context menus for notes and fileClass notes.

### Data quality

- **Required fields** — a per-field `required` flag (schema editor toggle); an
  empty required field is a violation.
- **Validation columns** in the `fileclass-table` view — a `valid` ✓/✗ column and
  an `errors` column showing which notes violate their schema (toggle in
  Settings, on by default).
- Consistent validation everywhere: the table columns, the `validate` API/CLI
  command, and every write (`setValue` / `set-where`) share one engine.

### Views (Bases)

- Generate a `.base` for a fileClass; one-way explicit sync with a status button.
- Editable **`fileclass-table`** Bases view (in-cell typed editing).
- Open / Modify a fileClass's base (command + context menu).

### Terminal (API, CLI & TUI)

- **Public plugin API** (v1.0) on `plugin.api` — JSON-serializable inspect /
  validate / mutate surface (`listFileClasses`, `getSchema`, `explain`,
  `listNotes`, `validate`, `setValue`, `clearValue`, `insertMissing`,
  `setValueWhere`, …), reachable via `obsidian eval`.
- **`fileclass` CLI** — terminal access driving the running app: `fileclasses`,
  `schema`, `explain`, `list`, `get`, `set`, `validate` (CI-friendly exit code),
  and dry-run-by-default `set-where` bulk edits; `--json` on any command.
- **Interactive TUI** (ink) — home menu, browse fileClasses → notes → fields,
  typed editing (choice + File-candidate pickers), inline validation status, and
  vault switching.
- **Vault targeting** — `--vault` / `FILECLASS_VAULT` / `fileclass use` default /
  active vault, in that precedence.

### Quality

- 186 unit tests; TypeScript strict; private Obsidian/Bases internals isolated
  behind a single adapter and best-effort DOM boundaries.

### Fixed

- **Select/Cycle/Multi "From a note" source** now resolves the note path
  tolerantly (exact path, then linkpath), so a `valuesListNotePath` without the
  `.md` extension still finds the note and returns its values instead of a blank
  list. The field-options "Note path" input also gained a note autocomplete, so
  the path is picked rather than typed by hand (#20).

### Compatibility

- Lowered `minAppVersion` to **1.12.7** (was 1.13.2). The plugin loads and the
  schema/typed-input layer works without Bases; Bases-backed features degrade
  gracefully when the core Bases internals differ or are absent, rather than
  erroring. Full parity of Bases-backed features on 1.12.7 should be verified on
  a real install before release.
