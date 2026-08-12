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

{{< video "024" >}}

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

{{< video "025" >}}

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

{{< video "030b" >}}

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

{{< video "025b" >}}

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

## Creating a note with a class

{{< video "036c" >}}

A table shows every note of a class except the one you are about to write.
**Fileclass: create a note with a class**, or the **New _Class_** button in a
`fileclass-table`'s toolbar, does the whole gesture: it asks for a name, creates the
note in the right folder, applies the class's template, writes the binding and every
field, and opens the fields modal on it.

**Where it lands** — the class's **Notes folder** if it declares one; otherwise the
single folder it already binds through *Files paths* (a class bound to one folder has
said where its notes live); otherwise Obsidian's default for new notes. With several
bound folders, nothing is guessed and the default is used.

**The order matters, and it is the design.** The template is applied *first*, the
fields *second*. The other way round gives two `---` blocks and broken YAML; this way
`processFrontMatter` merges into whatever the template left, so **a duplicate
frontmatter is impossible**, and a value the template set is kept — only missing keys
are filled.

The binding is always written, even when the target folder already binds the note:
the `fileClass` key is the highest-priority binding and the only one that survives the
note being moved.

### From a reverse relation, already filled in

On a [reverse-relation table](../views/#the-other-end-of-a-relation) read from an
author's note, the button says **New Book with Frank Herbert** and the new note
arrives with `author` already pointing at him. That one value is the exception to the
rule above: a template's default for `author` is a preference, clicking that button is
an instruction, so the seed wins.

### Which class, from a table

The view's own declaration — `baseFile` + `baseView` on a class note — says which
class a table is about, so no filter is parsed. A table about several classes offers
no button: there is nothing to create without asking, and the command is where that
question belongs.

## Creating notes with a template (Templater / Templates)

{{< video "031" >}}

Fileclass is **frontmatter-only**, so it composes cleanly with the core
**Templates** plugin and **Templater**: keep managing the note *body* with your
template, and let Fileclass manage the *frontmatter*.

A class can name its own template in **Note template**, applied by *create a note
with a class* above — Templater when it is installed, otherwise the core plugin's
`{{title}}`, `{{date}}` and `{{time}}` substitutions, applied directly (its own
command asks which template, a question the class has already answered).

> **Templater folder templates.** If Templater already applies a folder template to
> the target folder, leave **Note template** blank — otherwise both run and the note
> gets the template twice.

The other route, for notes you create by hand, is to bake the fields into the template
**once**:

1. Create a template note and run **Add fileClass** on it — from its right-click
   menu, from **Fileclass: add a class to this note**, or from the footer of the
   note-fields modal. A template is a note, so this does there what it does
   anywhere: it writes the binding **and** every field the class declares, empty,
   in one go. (Templater can even work `fileClass:` out dynamically.)
2. New notes created from the template now start with the binding **and all the
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

## When something a fileClass points at moves

A fileClass stores **paths**: the note a `Select` reads its values from, the `.base`
a link field takes candidates from, the `.canvas` a Canvas field follows, the base
the class syncs to, the folders it claims.

Obsidian rewrites the links inside a note's **body** when a file is renamed. A path
in frontmatter is a plain string, so nothing rewrites it — a known limit of
properties, not a Fileclass one. Renamed and left alone, the reference is dangling
and the effect is silent: a values list that comes up empty, a field with no
candidates, or — the one with teeth — a folder binding whose notes quietly stop
carrying the class.

So Fileclass **tells you, and changes nothing**:

> Fileclass: "Authors.base" moved, and fileClasses still point at it — Comic ›
> contributors, Book › author. Until the definition is updated, the field offers no
> candidates.

Your definition stays yours: fixing it is a decision, taken in the schema editor
where you can see the rest of the field.

### The sweep

The warning above rides on Obsidian telling Fileclass about a rename. Move a file
while the plugin is off, from your file manager, or from another machine over sync,
and no event ever arrives. So Fileclass also **sweeps** once per session, after the
first index build, and on demand:

**Fileclass: check what my classes point at** asks every class whether what it names
still exists — the values notes, the bases, the canvases, the folders it claims —
and adds two questions a path cannot answer: does its `extends` name a class the
vault has, and can each of its tags actually bind.

> Fileclass: 3 broken references, 1 that will never bind — see the schema log.

### The log

A notice lasts fifteen seconds, and this is the kind of breakage found three weeks
later. Everything above is also appended to **`<class folder>/fileclass.log`**, one
event per line — timestamp, level, event id, message, and JSON details:

```
2026-08-12 08:37:41	ERROR	schema.missing-path	Book › author: "Gone.base" — the field offers no candidates	{"fileClass":"Book","field":"author","value":"Gone.base"}
2026-08-12 08:37:41	ERROR	schema.missing-folder	Book: "Gone folder" — no note is bound by this folder	{"fileClass":"Book","value":"Gone folder"}
2026-08-12 08:37:41	WARNING	schema.dead-tag	Album: "two words" — a tag cannot contain a space, so it binds nothing	{"fileClass":"Album","value":"two words"}
```

Three levels, with a rule behind them:

| Level | What it means |
|-------|---------------|
| **ERROR** | Fileclass cannot do what a definition told it: a path pointing at nothing, an `extends` naming a class the vault does not have. |
| **WARNING** | A definition that will never do anything, silently: a tag that cannot bind, an `excludes` naming a field the parent never declared. |
| **INFO** | A write Fileclass performed across files you did not have open: a rename migrated, a base synced, a canvas drawn. |

What writes an `INFO` line, today: a field renamed across notes, missing fields
inserted across a class, a bulk edit, a base created or synced, the schema canvas
drawn, a reverse-relation view created, and the Canvas engine filling fields from a
`.canvas` — the one surface that writes frontmatter without being asked. Each says
how many notes it touched.

The log records **consequences, not edits**. Your editing history is git's job, and
Obsidian's File Recovery already answers "what did this look like yesterday" — a log
that also carried every keystroke would bury the one line that says something broke.

**Fileclass: open the schema log** opens it in a window rather than in the file:
each level carries an icon and a colour, the chips filter by level (they are the
counts you just read, made clickable), the search narrows on the message, and every
line that names a fileClass has a wrench through to its schema — a log you cannot act
on is read twice and then ignored. **Check now** re-runs the sweep without leaving.

The file itself is a `.log` rather than a note on purpose: every markdown file in the
class folder is read as a fileClass, so a `.md` log living there would come back as a
class of its own. *Open the file* shows it raw.

**A problem is logged once**, not once per sweep — otherwise a session that re-listed
the same twelve findings would drown the line saying something *changed*. When it is
fixed, that is a line too:

```
2026-08-12 09:03:12	INFO	schema.resolved	Book › author: "Gone.base" — fixed
```

so the file reads as a record of what happened rather than a snapshot of what is
wrong. A problem that comes back after being fixed is logged again.

### Retention

A log nobody prunes eventually costs more to open than it is worth, and this one is
written by vault events — a busy month of renames fills it without anybody noticing.

**Settings → Fileclass → Schema log size** is how many entries the live file keeps
(500 by default; 0 lets it grow). Past that, the whole file rolls over to
**`<class folder>/.logs/archive_0001.log`**, then `0002`, and so on. **Archives
kept** bounds how many are held (5 by default; 0 discards the overflow instead).

Numbering only ever goes up, and nothing is renamed on rotation: an archive's name
means when it was written, and pruning removes the lowest numbers. In the window, a
toggle appears once archives exist — **Include N archives** merges them into the
list, off by default, since the live file is what answers "what just happened".

Turn the whole thing off in **Settings → Fileclass → Schema log**; the notices stay.
