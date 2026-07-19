---
title: "Positioning"
weight: 10
---

Fileclass sits deliberately between three things Obsidian users already know.
Understanding the boundaries is the fastest way to know whether it is for you.

## Fileclass vs core Obsidian

| Capability | core **Properties** | core **Bases** | **Fileclass** |
|------------|:---:|:---:|:---:|
| Property types | flat, vault-global | reads (incl. nested) | **per-class schema** |
| Constrained / enum values | ✗ | ✗ | ✓ (Select, Cycle) |
| Relations (foreign-key-like) | ✗ | ✗ | ✓ (File/MultiFile constrained by a Base view) |
| Nested typed editing | ✗ | reads only | ✓ (Object / ObjectList editor) |
| Reverse relations / computed columns | ✗ | ✓ (views) | ✗ (use Bases) |
| Query & views | ✗ | ✓ | **delegated to Bases** |

- Core **Properties** types are flat and vault-global: no per-class schema, no
  constrained values, no relations, no nested editing.
- Core **Bases** queries and views properties (including nested ones) but cannot
  edit nested values and has no schema.
- **Fileclass** adds the schema (`fileClass` ≈ a table schema), typed fields, and
  a real nested editor — and reuses Bases as the query/view engine rather than
  shipping its own.

## The mental model

If you think in terms of databases:

- a **fileClass** ≈ a table schema,
- a **File / MultiFile** field constrained by a Base view ≈ a foreign key,
- a **Select** ≈ an enum,
- an **Object / ObjectList** ≈ a nested/embedded record.

Reverse relations and computed columns (the equivalent of Metadata Menu's Lookup
and Formula) are **out of scope** — Bases views already provide them.

## Fileclass vs Metadata Menu

Fileclass is the successor to Metadata Menu, by the same author. The fileClass
file format is **unchanged** — existing fileClass notes load as-is.

**Migrate to Fileclass if** your fields live in **frontmatter**. You gain the
Bases engine, persisted computed values, and no Dataview dependency.

**Stay on Metadata Menu if** you depend on **inline fields** (`key:: value`) or
Dataview virtual properties (e.g. `file.tasks`). Fileclass is frontmatter-only by
design and will not read or write inline fields.

> **What changes on migration**
>
> - Field options that referenced a Dataview query (`dvQueryString`) now
>   reference a `.base` file + view; the legacy option keys are ignored (they
>   never crash the index). Point the field at a `.base` view to restore its
>   values/candidates.
> - `processFrontMatter` normalizes some formatting on first write (YAML
>   comments are dropped, flow lists become bullet lists, superfluous quotes are
>   removed). Top-level and nested key **order is preserved**.
