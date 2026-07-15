---
title: "Schema layer"
weight: 20
---

Fileclass reads **fileClass notes** — one note per note-type — and turns them
into typed schemas. This page describes what a fileClass is, how inheritance
works, and how a note is bound to its fileClass(es). This is the read-only
foundation (P1); typed input, editing, and computed fields come later.

## fileClass notes

A fileClass is a Markdown note whose frontmatter declares fields and options.
Its **name** is the note's filename, and all fileClass notes live under one
folder, set in **Settings → Fileclass → Class files folder**.

```yaml
---
extends: Media          # optional parent fileClass
excludes: [draft]       # inherited field names to drop
mapWithTag: true        # bind notes tagged #Book to this fileClass
tagNames: [novel]       # extra tags that bind to this fileClass
filesPaths: [Library]   # bind notes under these folders
limit: 20
icon: book
version: "2.0"
fields:
  - name: author
    id: a1b2c3
    type: Select
    options: [unknown, me]
    path: ""            # "" = root; nesting uses parent ids joined by "____"
---
```

The file format is **Metadata Menu's, unchanged** — existing fileClass notes
load as-is. Legacy Dataview-era options (`dvQueryString`, `customRendering`, …)
are ignored here and reported by the migration audit (a later phase).

## Fields

Each entry in `fields` is `{ name, id, type, options, path }`:

- **id** — stable identifier (used for ordering and nesting).
- **type** — one of the recognized field types (Input, Number, Select, Multi,
  Date, File, Object, ObjectList, Lookup, Formula, …). Unknown types load as
  `Input` and are reported as a non-fatal error rather than crashing the index.
- **path** — `""` for a root field; otherwise the parent field ids joined by
  `____`, so `fields[0].name`-style nesting is preserved.

## Inheritance

A fileClass may `extends` one parent, forming a chain (`Child → Parent → …`).
The chain is **cycle-guarded**: a self-reference or loop simply stops.

Resolved fields = the class's own fields, then each ancestor's, **de-duplicated
by field name** (the nearest declaration wins). `excludes` removes inherited
fields and **accumulates down the chain**: a class's excluded names are dropped
from that class and every deeper ancestor.

## Binding a note to fileClass(es)

A note can be bound to one or more fileClasses. When several sources apply, they
are combined in this priority order (fields de-duplicated by id):

1. **Frontmatter alias** — the `fileClass:` key on the note (the alias is
   configurable). Accepts a single value or a list.
2. **Tag match** — a note tag equals a fileClass's `mapWithTag` name or one of
   its `tagNames`.
3. **Path match** — the note lives under one of a fileClass's `filesPaths`.
4. **Bookmark group match** — the note is in a mapped bookmark group.
5. **Base-view match** — the note is returned by a fileClass's bound Base view
   (replaces Metadata Menu's Dataview `fileClassQueries`; wired in a later phase).
6. **Global fileClass** — a fallback applied to notes with no other binding.
7. **Preset fields** — a last-resort field set.

The index rebuilds automatically (debounced) when the metadata cache settles or
a fileClass note changes, and emits a `fileclass:indexed` event.

## Adding a fileClass to a note

Run the command **Fileclass: add fileClass to current file** and pick a
fileClass. It writes the binding into the note's frontmatter (frontmatter-only,
via a single `processFrontMatter` write).
