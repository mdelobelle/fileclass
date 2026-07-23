# Changelog

All notable changes to Fileclass are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### UI

- **Sticky action footer in tall modals** ([#49](https://github.com/mdelobelle/fileclass/issues/49)):
  the primary button (Save / Add field) stays pinned to the bottom while the
  fields scroll, so it's always reachable — Add/edit field, fileClass options,
  the schema editor, and the Object/ObjectList editors.

- **User-editable custom color palette** ([#43](https://github.com/mdelobelle/fileclass/issues/43)):
  define your own colors in Settings → **Custom colors** (add via the native
  dialog, remove on hover). They appear in every `Color` picker after the
  standard palette — order: standard → your custom colors → the note's current
  value — and the picker's **+** pins a new color to the palette on the fly.
- **Custom colors in canvas field filters** ([#43](https://github.com/mdelobelle/fileclass/issues/43)):
  the color filters of `Canvas`/`CanvasGroup`/`CanvasGroupLink` fields are no
  longer limited to the 6 presets — they now show circular swatches for the
  presets, your saved custom colors, and the colors actually used in the
  referenced `.canvas`, plus a **+** for an arbitrary color.
- **Consistent field-type value previews** ([#44](https://github.com/mdelobelle/fileclass/issues/44)):
  a `Color` value now shows its swatch and an `Icon` value its glyph everywhere a
  value is displayed — the editable `fileclass-table` view, the native Properties
  editor, and the note-fields modal — via one shared helper. Display-only.

### Fixed

- **Base columns for fields whose name contains a space** ([#37](https://github.com/mdelobelle/fileclass/issues/37)):
  a field like `Test Property` was written to the generated base's `order:` as
  `note["Test Property"]`, which Bases re-prefixed to `note.note["Test Property"]`
  — an empty, non-editable column. The `order:` now uses the **bare property
  name** (`- "Test Property"`), which Bases normalizes to `note.Test Property`
  and renders/edits correctly. Existing bases self-heal on the next sync.

### Fields & typed input

- **`Color` field type** ([#33](https://github.com/mdelobelle/fileclass/issues/33)):
  stores a CSS color scalar, chosen from **palette swatches** (extensible **Color
  source** option, Obsidian Canvas palette by default) plus a **custom color**
  (native color input + any CSS value: hex/`rgb()`/name). Stores the raw CSS
  value for core Bases Map view marker interop. Native input + CSS, no dependency.
- **`Icon` field type** ([#32](https://github.com/mdelobelle/fileclass/issues/32)):
  stores an icon id chosen from a searchable **visual picker** (real previews via
  `getIconIds()`/`setIcon()`). An extensible **Icon source** option selects the
  bank — Lucide (default) or all registered icons. Stores the bare id (`map-pin`)
  for core Bases Map view marker interop. No dependency.
- **`Location` field type** ([#31](https://github.com/mdelobelle/fileclass/issues/31)):
  stores geographic coordinates as a `"lat,lon"` scalar (Bases Map view
  convention). Guided entry with range-validated latitude/longitude fields, a
  paste box, and an **Open in map** link (opens OpenStreetMap in the browser).
  No embedded map picker (no remote resources loaded in the plugin).
- **`template` option on `Input`** ([#27](https://github.com/mdelobelle/fileclass/issues/27)):
  compose an `Input` value from a fixed structure with `{{name}}` (free-text) and
  `{{name:["a","b"]}}` (dropdown) placeholders. Editing shows a guided form with
  one control per placeholder plus a live result preview; the stored value stays
  a single text scalar. Ports Metadata Menu's `options.template`.
- **`MultiInput` field type** ([#28](https://github.com/mdelobelle/fileclass/issues/28)):
  the list-valued counterpart of `Input` — stores a YAML list of text scalars and
  reuses the `template` option. A list editor adds/removes/reorders items, each
  entered through the same guided (or plain) input as `Input`. For capturing
  several values that share one shape (e.g. repository URLs).
- **`Duration` field type** ([#30](https://github.com/mdelobelle/fileclass/issues/30)):
  stores an RFC 5545 `DURATION` scalar (`P1W`, `PT1H30M`…). Editing lets you
  **type the value** in ISO (`PT1H30M`) or a human form (`1h 30m`, `2w`) with
  inline validation, or use weeks/days/hours/minutes/seconds spinners — the two
  stay in sync with a live compact preview. Zero runtime dependency; parsing and
  date math are done in-house.
- **`CycleDuration` field type** + **date "Set next date" action**: an ordered
  list of durations (an interval sequence). A `Date`/`DateTime` field can name a
  Duration/CycleDuration field via its **Next interval field** option; the date
  editor then gets a **Set next date** button that advances the date by the head
  interval and, for a CycleDuration, cycles the list to its next value (wrapping
  after the last) — one write. Covers spaced-repetition scheduling without a
  recurrence-rule engine (supersedes the dropped `Recurrence` proposal, #29).
- **Preset durations**: `Duration`/`CycleDuration` fields can define a list of
  preset durations in their schema, offered as quick picks at value entry (a
  one-click button for `Duration`, tap-to-append chips for `CycleDuration`).

## [0.0.4] - 2026-07-21

First public release installable on the stable Obsidian line (see
**Compatibility**). The successor to Metadata Menu, built on the core **Bases**
plugin, frontmatter-only, with no Dataview dependency.

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
