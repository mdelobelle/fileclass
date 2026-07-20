# Fileclass

**Schemas, typed fields & data quality for your Obsidian vault — powered by the
core Bases plugin.**

Fileclass adds typed, validated, per-note-type property schemas
("fileClasses") to your notes: guided input for every field, nested objects,
data-quality checks, and generated Bases views — all **frontmatter-only**, with
**no Dataview dependency**.

📖 **Documentation: https://mdelobelle.github.io/fileclass/**

It is the successor to [Metadata Menu](https://github.com/mdelobelle/metadatamenu)
(same author). If you rely on Dataview inline fields (`key:: value`), stay on
Metadata Menu; Fileclass is frontmatter-only.

## Why Fileclass

Metadata Menu used **Dataview** to feed field values — the allowed values or file
candidates for a `Select`/`File` field came from a DataviewJS query. Obsidian now
ships its own query engine, **Bases**, so Fileclass uses that instead: you point a
field at a `.base` view, and the notes/values that view returns become the
field's candidates. Field-value filtering runs entirely on core Obsidian.

- **No Dataview dependency**, lighter bundle.
- **Frontmatter-only** — reads via the metadata cache, writes via
  `processFrontMatter`; note text is never parsed or edited.
- **Rebuilt with quality & security in mind** — full unit-test coverage,
  TypeScript strict.
- **Your existing fileClass definitions work as-is** — the Metadata Menu format
  is unchanged.

## Features

- **fileClasses**: typed schemas with inheritance (`extends` / `excludes`),
  bound by alias, tag, path, bookmark group, Base view, or a global default.
- **Typed fields**: Input, Number, Boolean, Select, Cycle, Multi, Date/DateTime/
  Time, File/MultiFile, Media/MultiMedia, Object/ObjectList, JSON/YAML, and
  Canvas fields — with guided input everywhere (modal, native Properties editor,
  context menus, indicators).
- **Data quality**: required fields and per-note validation, surfaced in the
  table view and via the CLI/API.
- **Views**: generate a `.base` for a fileClass and keep it in one-way sync;
  an editable **`fileclass-table`** Bases view with in-cell typed editing.
- **Terminal**: a public plugin **API** (on the plugin instance), plus a
  standalone **CLI** and interactive **TUI** — in their own repo,
  [fileclass-cli](https://github.com/mdelobelle/fileclass-cli) — to inspect,
  validate and edit typed frontmatter from the command line.

## Requirements

- Obsidian **1.13.2+** with the core **Bases** plugin enabled.
- Schema and typed input work without Bases; query-dependent features
  (File/Media candidates, generated views) require it.

## Installation

Fileclass is **not yet in the community plugin store**. To install manually:

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/mdelobelle/fileclass/releases) (or from
   the repository root).
2. Copy them into `<your-vault>/.obsidian/plugins/fileclass/`.
3. Reload Obsidian and enable **Fileclass** in **Settings → Community plugins**.

## Coming from Metadata Menu

Your fileClass notes are read as-is. Two things changed:

- **`Lookup` and `Formula` are out of scope** — use Bases views for reverse
  relations and computed columns. Existing ones load read-only.
- **The old FileClassView is replaced by `fileclass-table`** — a Bases view with
  editable cells.

> Metadata Menu still works, but **don't run both at the same time**. It is in
> maintenance mode and won't receive further features.

## Feedback

Bug reports, ideas and recommendations are very welcome — please open an issue:
**https://github.com/mdelobelle/fileclass/issues**

## License

[MIT](LICENSE)
