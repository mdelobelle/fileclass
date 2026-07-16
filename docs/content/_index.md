---
title: "Fileclass"
---

# Fileclass

**Fileclass** is the schema and data-quality layer for Obsidian vaults: typed,
validated, per-note-type property schemas ("fileClasses") with guided input,
nested objects, and computed fields — using the **core Bases plugin** as the
query and view engine.

It is the successor of [Metadata Menu](https://github.com/mdelobelle/metadatamenu)
(same author). Metadata Menu goes into maintenance mode; if you rely on Dataview
inline fields (`key:: value`), stay there. Fileclass is **frontmatter-only** and
has **no Dataview dependency**.

> **Under construction.** Fileclass is being built in phases. Foundations (P0)
> and the read-only schema layer (P1) are in place: the build toolchain, the
> Bases adapter, the query/path engines, fileClass parsing, inheritance, the
> binding resolver, and the fileClass chooser. Typed fields, editing, computed
> values, views, and migration land in later phases.

## Documentation

- [Positioning](positioning/) — how Fileclass relates to core Properties, core
  Bases, and Metadata Menu, and who should use it.
- [Schema layer](schema/) — fileClass notes, fields, inheritance, and binding.
- [Fields & input](fields/) — typed, validated value input for all field types.
- [UI surfaces](ui/) — the note-fields modal and context-menu entries.

## Requirements

- Obsidian **1.13.2+** with the core **Bases** plugin enabled.
- Schema and typed input work without Bases; query-dependent features
  (File/Media fields, generated views) require it.
