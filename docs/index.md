# Fileclass

**Fileclass** is the schema and data-quality layer for Obsidian vaults: typed,
validated, per-note-type property schemas ("fileClasses") with guided input,
nested objects, and computed fields — using the **core Bases plugin** as the
query and view engine.

It is the successor of [Metadata Menu](https://github.com/mdelobelle/metadatamenu)
(same author). Metadata Menu goes into maintenance mode; if you rely on Dataview
inline fields (`key:: value`), stay there. Fileclass is **frontmatter-only** and
has **no Dataview dependency**.

!!! warning "Under construction"
    Fileclass is being built in phases. This is the P0 (foundations) skeleton:
    the build toolchain, the Bases adapter, and the query/path engines are in
    place; schema parsing, fields, computed values, views, and migration land in
    later phases.

## Documentation

- [Positioning](positioning.md) — how Fileclass relates to core Properties, core
  Bases, and Metadata Menu, and who should use it.

## Requirements

- Obsidian **1.13.2+** with the core **Bases** plugin enabled.
- Schema and typed input work without Bases; query-dependent features
  (File/Lookup/Formula fields, generated views) require it.
