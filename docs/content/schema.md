---
title: "Schema layer"
weight: 20
---

Fileclass reads **fileClass notes** — one note per note-type — and turns them
into typed schemas. This page describes what a fileClass is, how inheritance
works, and how a note is bound to its fileClass(es). This is the read-only
foundation (P1); typed input, editing, and computed fields come later.

## fileClass notes

A fileClass is a Markdown note whose filename ends in **`.fileclass.md`** — for
example `Book.fileclass.md`. Its **name** is that basename (`Book.fileclass`).
fileClass notes are discovered **anywhere in the vault**, so a definition can
live in whatever folder its scope belongs to. The **Settings → Fileclass →
Default folder for new fileClasses** setting only chooses where the *create*
command puts new ones; it does not limit discovery.

Create one with the command **Fileclass: create a class** — it prompts for a
name (capitalized automatically), creates `<Name>.fileclass.md` in the default
folder, and opens its schema editor.

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
are ignored (they never crash the index); new link fields use a `.base` file +
view instead.

## Fields

Each entry in `fields` is `{ name, id, type, options, path }`:

- **id** — stable identifier (used for ordering and nesting).
- **type** — one of the recognized field types (Input, Number, Select, Multi,
  Date, File, Object, ObjectList, …). Unknown types load as `Input` and are
  reported as a non-fatal error rather than crashing the index. (`Lookup` and
  `Formula` are out of scope — see [Fields & input](../fields/).)
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
   configurable), whose value is a **wikilink** to the fileClass note, e.g.
   `fileClass: "[[Book.fileclass]]"`. Accepts a single link or a list of links.
   Links resolve the same way Obsidian resolves any `[[…]]` — folder-independent
   and automatically rewritten when the definition is renamed or moved. A
   fileClass in any scope can be composed with global ones by listing several:
   `fileClass: ["[[Area.fileclass]]", "[[Task.fileclass]]"]`. Plain-text names are
   **not** resolved — use a wikilink.
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

Run the command **Fileclass: add a class to this note** and pick a
fileClass. It writes a plain `[[<name>.fileclass]]` **wikilink** into the note's
frontmatter (frontmatter-only, via a single `processFrontMatter` write).

Generated `<fileClass>.base` files filter on the linked value
(`list(fileClass).contains("<name>")`), so a note bound by wikilink still shows
up in its fileClass's base view.

## Creating notes with a template (Templater / Templates)

Fileclass is **frontmatter-only**, so it composes cleanly with the core
**Templates** plugin and **Templater**: keep managing the note *body* with your
template, and let Fileclass manage the *frontmatter*.

The trick to avoid running **Insert missing fields** on every new note is to
bake the fields into the template **once**:

1. Create a template note and put the binding in its frontmatter (e.g.
   `fileClass: "[[Book.fileclass]]"`).
2. Open that template note and run **Fileclass: insert missing fields in current
   file** once — it writes every field of the fileClass (empty) into the
   template's frontmatter. (Templater can even pre-fill `fileClass:` dynamically.)
3. New notes created from the template now start with the binding **and all the
   fields already present** — just fill them in via the note-fields modal or the
   Properties edit buttons. No per-note command needed.

> **When the schema changes:** templates don't re-sync automatically. If you add
> a field to the fileClass later, re-run **Insert missing fields** on the
> template so new notes pick it up (existing notes get it the next time you run
> the command on them).

## Editing a fileClass

You can author a fileClass's own definition from the UI — no need to edit its
YAML by hand. Run **Fileclass: edit a class schema** (or right-click a
fileClass note → **Manage this fileClass**) to open the schema editor:

- **Fields** — add, edit, remove, and reorder field definitions. A field has a
  **name**, a **type**, and type-specific settings; its stable id is generated
  automatically.
- **Options…** — edit the fileClass options: `icon` (a Lucide name), `extends`
  (parent fileClass), **Sync to base** (mirror the fields into a `.base`, see
  [Views](../views/)), `mapWithTag`, `tagNames`, `filesPaths`, `bookmarksGroups`,
  and `excludes`.

### Type-specific field settings

When adding or editing a field, its type reveals the relevant settings:

- **Number** — min, max, step.
- **Date / DateTime / Time** — format and insert-as-link.
- **Select / Cycle / Multi** — the values source: an **inline list** (edit values
  in place), **from a note** (its non-empty lines), or **from a Base view** (the
  names of the files the view matches).
- **File / MultiFile / Media / MultiMedia** — a **Base file** and **view**
  (candidate source), an optional **display column** (the alias), and **embed**
  (Media).
- **Object / ObjectList** — a **Children** button opens the same editor scoped to
  the object's nested fields; nesting can go several levels deep.

Every change is a single `processFrontMatter` write on the fileClass note,
preserving unknown keys.
