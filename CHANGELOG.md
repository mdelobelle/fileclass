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

### Views (Bases)

- Generate a `.base` for a fileClass; one-way explicit sync with a status button.
- Editable **`fileclass-table`** Bases view (in-cell typed editing).
- Open / Modify a fileClass's base (command + context menu).

### Quality

- 176 unit tests; TypeScript strict; private Obsidian/Bases internals isolated
  behind a single adapter and best-effort DOM boundaries.
