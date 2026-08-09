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

Create one with the command **Fileclass: create a class** — it prompts for a
name (capitalized automatically), creates the note in that folder, and opens its
schema editor.

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

{{< video "002" >}}

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

`Extends` is a **dropdown** over the fileClasses you have — never the class itself, and
never one that already inherits from it (that would be a cycle). A parent that doesn't exist
inherits nothing, so there is nothing to gain from typing a name; a value that no longer
resolves (a renamed class, a hand-edited note) stays in the list marked *no such fileClass*,
so the declaration is visible rather than lost.

`Excludes` — the inherited fields this class drops — is picked from the parent's own fields,
never typed: a misspelled name excluded nothing and said nothing. With no parent, there is
nothing to choose and the row says so.

Beside it, a link opens the parent's schema — a class's editor lists its **own** fields only,
since showing an ancestor's there would leave you wondering which copy you were editing. The
link appears only when the name resolves.

## Binding a note to fileClass(es)

A note can be bound to one or more fileClasses. When several sources apply, they
are combined in this priority order:

1. **Frontmatter alias** — the `fileClass:` key on the note (the alias is
   configurable). Accepts a single value or a list.
2. **Tag match** — a note tag equals a fileClass's `mapWithTag` name or one of its
   `tagNames`, **or nests under one**: a note tagged `#author/french` binds to the
   class mapped on `author`, the way Obsidian's tag search and tag pane treat nested
   tags — and the way a [generated view](../views/#what-the-managed-view-filters-on)
   sees them, since Bases' `file.hasTag()` includes children. When both a tag and
   its parent are mapped, the most specific class comes first and the parent still
   applies. Frontmatter tags and inline `#tags` both count.
3. **Path match** — the note lives under one of a fileClass's `filesPaths`.
4. **Bookmark group match** — the note is in a mapped bookmark group, or in one nested
   under it: a note in `Films/Tarkovsky` answers to a class bound to `Films`, the way a
   nested tag answers to its parent.
5. **Base-view match** — the note is returned by a fileClass's bound Base view
   (replaces Metadata Menu's Dataview `fileClassQueries`; wired in a later phase).
6. **Preset fields** — a last-resort field set, for a note none of the above reaches.

### Renaming a field

A field's name is the frontmatter key it writes, so renaming it is a **data migration**: the
notes that carry the old key would otherwise keep it, with their values, while the new name
had nothing under it — the field reading as empty everywhere while its data sat one line
above, under a name nothing knew about.

So the save says what it is about to do. Change a field's name and the button reads **Save and
migrate…**; it writes the class note, then lists the notes that actually carry the old key and
asks before touching them. *Leave the notes alone* is a real answer, and so is Escape.

The rename keeps each key **where it stood** — frontmatter order is what the Properties panel
shows — and descends into groups and into every item of an `ObjectList`. A note where the new
name already exists is left alone: overwriting a value you can see would be worse than doing
nothing.

### Picking what a class claims

`Tag names`, `Files paths` and `Bookmark groups`, in a class's options, are **picked from the
vault**, not typed: the tags it uses (most used first), its folders, and the groups of the
Bookmarks core plugin. Everything you could write there already exists, and a misspelling
used to bind nothing and say nothing.

A binding that matches nothing today — a folder renamed, a tag that fell out of use — is
**kept and still offered**, since dropping it on sight would untype every note it reached.
When there is nothing to offer at all, the row says so rather than opening an empty picker.

### The global fileClass

Set one and **every note carries it**, whatever else it is: the one template the whole vault
shares — a `source`, an `added`, whatever your notes all have in common — without declaring
it in each class. A note with no binding of its own has just that one; a note that names its
own classes has the baseline *and* them.

It is the **lowest** precedence: on a key the baseline and one of the note's own classes both
declare, the note's own class wins. Its rows come first in a note's fields, since a baseline
is what the rest is written on top of.

One exception, and it is not a note you write: the **class folder**. A fileClass declaration
is not one of the things a vault-wide class is describing.

When two bound classes declare **the same key**, the last one wins — `fileClass: [Book,
Article]` reads as "a Book, and an Article on top", and the note has exactly one
`publisher` to write to. The winner brings its own type and options, and the field sits
with the rest of the class that owns it. A group's child is a different field from a root
field of the same name (`editions.publisher` beside `publisher`), so those never collide.

The index rebuilds automatically (debounced) when the metadata cache settles or
a fileClass note changes, and emits a `fileclass:indexed` event.

## Adding a fileClass to a note

Run the command **Fileclass: add a class to this note** and pick a
fileClass. It writes the binding into the note's frontmatter (frontmatter-only,
via a single `processFrontMatter` write) and then **inserts that class's missing
fields**, so the note arrives typed and empty rather than bound and bare. Turn
[**Insert fields when adding a class**](../settings/#behavior) off to keep the
binding alone and insert them yourself.

A fileClass note can also be created from the **class-files folder's right-click
menu** (*Create a class*), not only from the command palette.

## Creating notes with a template (Templater / Templates)

Fileclass is **frontmatter-only**, so it composes cleanly with the core
**Templates** plugin and **Templater**: keep managing the note *body* with your
template, and let Fileclass manage the *frontmatter*.

The trick to avoid running **Insert missing fields** on every new note is to
bake the fields into the template **once**:

1. Create a template note and put the binding in its frontmatter (e.g.
   `fileClass: Book`).
2. Open that template note and run **Fileclass: insert missing fields in current
   file** once — it writes every field of the fileClass (empty) into the
   template's frontmatter. (Templater can even pre-fill `fileClass:` dynamically.)
3. New notes created from the template now start with the binding **and all the
   fields already present** — just fill them in via the note-fields modal or the
   Properties edit buttons. No per-note command needed.

> **When the schema changes:** templates don't re-sync automatically. If you add
> a field to the fileClass later, re-run **Insert missing fields** on the
> template so new notes pick it up. The notes already written don't move either:
> run the command on one of them, or
> [across the whole class at once](../ui/#insert-missing-fields-across-a-class).

## Editing a fileClass

You can author a fileClass's own definition from the UI — no need to edit its
YAML by hand. **One screen does it**, reached three ways: the command **Fileclass:
edit a class schema**, a fileClass note's right-click menu (**Manage this
fileClass**) or its indicator icon, and the fileClass name in the footer of a note's
[fields modal](../ui/#note-fields-modal).

- **This fileClass** — the actions that apply to the class itself, the same set as
  its right-click menu: **Options…**, create or modify **its base**, **open** that
  base (greyed out until one exists), and **bulk edit** one of its fields.
- **Fields** — add, edit, remove, and reorder field definitions. A field has a
  **name**, a **type**, and type-specific settings; its stable id is generated
  automatically.
- **Options…** — edit the fileClass options, in three sections:
  - **Identity** — **Extends** (its parent, picked from the classes you have, with a
    button through to that parent's schema), **Excludes** (the inherited fields it
    drops, picked from the parent's own), and **Icon** (a Lucide name).
  - **Bound notes** — which notes carry the class beyond those naming it in their
    frontmatter: **Map with tag**, **Tag names**, **Files paths**, **Bookmark
    groups**.
  - **Sync to base** — mirror the fields into a `.base`; see [Views](../views/).

### Type-specific field settings

When adding or editing a field, its type reveals the relevant settings:

- **Number** — min, max, step.
- **Date / DateTime / Time** — format and insert-as-link.
- **Select / Cycle / Multi** — the values source: an **inline list** (edit values
  in place), **from a note** (its non-empty lines), or **from a Base view** (the
  names of the files the view matches).
- **File / MultiFile / Media / MultiMedia** — a **Base file** and **view**
  (candidate source) and an optional **display column** (the alias).
- **Object / ObjectList** — a **Children** button opens the same editor scoped to
  the object's nested fields; nesting can go several levels deep.

Every change is a single `processFrontMatter` write on the fileClass note,
preserving unknown keys.
