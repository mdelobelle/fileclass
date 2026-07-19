---
title: "Fileclass"
---

# Fileclass

**Fileclass** is the schema and data-quality layer for Obsidian vaults: typed,
validated, per-note-type property schemas ("fileClasses") with guided input and
nested objects — using the **core Bases plugin** as the query and view engine.

It is the successor of [Metadata Menu](https://github.com/mdelobelle/metadatamenu)
(same author). Metadata Menu goes into maintenance mode; if you rely on Dataview
inline fields (`key:: value`), stay there. Fileclass is **frontmatter-only** and
has **no Dataview dependency**.

## Documentation

- [Positioning](positioning/) — how Fileclass relates to core Properties, core
  Bases, and Metadata Menu, and who should use it.
- [Schema layer](schema/) — fileClass notes, fields, inheritance, and binding.
- [Fields & input](fields/) — typed, validated value input for every field type.
- [UI surfaces](ui/) — the note-fields modal, indicators, and property buttons.
- [Views](views/) — generating and syncing a `.base`, the editable table, and
  its validation columns.
- [CLI & API](cli/) — the public plugin API and the `fileclass` CLI/TUI:
  inspect, validate and edit typed frontmatter from the terminal.
- [Settings](settings/) — every setting explained.
- [Modeling guide](modeling/) — when to use a dedicated fileClass, a nested
  Object/ObjectList, or a free-form JSON/YAML field.

## Requirements

- Obsidian **1.13.2+** with the core **Bases** plugin enabled.
- Schema and typed input work without Bases; query-dependent features
  (File/Media fields, generated views) require it.
