---
title: "Views"
weight: 50
---

Fileclass delegates querying and display to the core **Bases** plugin — it does
not ship its own table engine. To see and browse the notes of a fileClass, you
use a `.base` file; Fileclass helps you create one.

## Generating a base

{{< video "032" >}}

Run **Fileclass: create a base for a class**, or **right-click a fileClass
note** → **Create a base for this fileClass**. A small dialog lets you choose:

- the **base file** path (new or existing; defaults to
  `<basesFolder>/<FileClass>.base`, the folder set in **Settings → Fileclass →
  Bases folder**), and
- the **view name** — the managed view (defaults to the fileClass name).

It creates the base — with an **editable `fileclass-table` view** (see below)
listing `file.name` and the fields — and records the choices on the fileClass
(`baseFile`/`baseView`). Pointing at an **existing** base is safe: only the
managed view is added or updated — your other views are left untouched.

### What the managed view filters on

The filter matches **every way a note can be bound to the class**, not just the
frontmatter property:

- `fileClass == "Author"` — the note names the class (whatever your *fileClass
  alias* is);
- `file.inFolder("Authors")` — one clause per **Files paths** folder. `inFolder`
  rather than an equality on the folder, because binding is by prefix: a note in
  `Authors/Deep/` is bound too;
- `file.hasTag("author")` — one clause per **tag name**, and the class name itself
  when *Map with tag* is on.

With more than one of those, they are `or`-ed inside the view's filter group, which
is where a [dependent field](../fields/#conditional-candidates-dependent-fields)
adds its own predicate. A class bound **only by folder or tag** leaves no property
on its notes at all: filtering on the property alone returned an empty view, which
is what a generated base used to do for every folder-mapped class.

Two bindings have no Bases equivalent and are therefore outside the filter:
**bookmark groups**, and a class named by a **Base view**. Notes bound only that
way won't appear in the generated view — add a clause of your own, and sync will
leave it alone.

A base generated before its class gained a folder or a tag is **repaired on the
next sync**, but only when its filter is still exactly what Fileclass wrote. Edit
that filter yourself and it becomes yours: sync then never touches it.

The fileClass filter is written **on the managed view** (Bases' *"This view"*
scope), not base-wide. So you can add a **second view for another fileClass** to
the same base — e.g. a `bookAuthor` view inside your `book` base — and it shows
its own notes instead of being shadowed by a base-wide `fileClass == "book"`
filter. Each view carries its own filter and is free to scope itself.

> **Existing generated bases** created before this change keep their base-wide
> filter — nothing is rewritten silently. To get the per-view behavior there,
> move the filter from *"All views"* to *"This view"* once in the Bases editor,
> or regenerate the base. Sync never moves it for you and never pushes a
> per-view scope back to base-wide.

Once a base exists, the right-click menu on the fileClass note changes:

- **Modify base for this fileClass** — reopens the same dialog (create/sync) on
  the existing base.
- **Open base for this fileClass** — opens the `.base` in a new tab. There's also
  the command **Fileclass: open this class's base**.

## Keeping a base in sync

{{< video "033" >}}

The class note's Properties panel says when a sync is due: its base button reads
**Sync the base** while the managed view no longer mirrors the class, and syncs
in one click. Nothing happens on its own — a base one field behind is a normal
state between a schema change and the moment you decide to carry it over.

A fileClass can **mirror** its fields into a base — **one-way and explicit**, so
your base is never rewritten behind your back. In the schema editor → **Options**,
the **Sync to base** group has:

- **Base file** — the `.base` to mirror into (the generate command fills it in).
- **View name** — the **managed view** inside that base (defaults to the
  fileClass name). Only this view is owned by Fileclass; every other view,
  filter, and sort in the base is yours and is never touched.
- **Base structure** — a status button:
  - **Synced** (disabled) — the managed view matches the fileClass's fields.
  - **Sync** (active) — the base diverged (you edited it, or the fileClass
    changed). Click to re-apply the mirror (`file.name` + the current fields).

Nothing is written automatically: when the fileClass or the base changes, the
status simply flips to **Sync** and waits for you. If the declared base doesn't
exist, **Sync** creates it. There's also a command, **Fileclass: sync this
class to its base**.

> If the base is **open in a tab** when you sync, its layout may not be on disk
> yet (Bases keeps it in memory until the tab closes). Sync detects this and
> offers to **close the tab first** so its state is flushed before mirroring —
> otherwise the sync would read an empty file and do nothing.

> The sync round-trips the YAML, which reformats the file and drops YAML
> comments — fine for the plugin-managed base.

## Editable table view

Fileclass registers a Bases view type, **`fileclass-table`**, that renders like a
table but lets you **edit cells in place**: clicking a `note.<field>` cell performs
[that type's gesture](../ui/#one-gesture-per-field-type) — a `Cycle` advances, a
`Boolean` flips, everything else opens the field's typed input (the same one used
everywhere). **Alt-click** always opens the input. `file.*` and `formula.*` cells
stay read-only.

Generated bases use it by default. In any other base, set a view's `type` to
`fileclass-table` to get the same editing (the managed view keeps working with
the sync — its type is preserved). It requires the core Bases plugin; with Bases
disabled the view type is simply unavailable (switch the view back to `table`).

> It renders all rows (no virtualization yet), so very large bases are better
> viewed with a native `table` view.

## Validation columns

The `fileclass-table` view can prepend a **`valid`** column and append an
**`errors`** column, turning the table into a live data-quality dashboard:

- **`valid`** shows **✓** when every one of the note's fields satisfies its
  schema, or **✗** when at least one does not (missing [required
  fields](../fields/#required-fields), out-of-range numbers, values outside a
  `Select`'s allowed list, malformed dates, …).
- **`errors`** lists the messages for the failing fields (full text on hover).

Validation covers **all** of the note's root fields, not just the columns shown.
Toggle it under **Settings → Fileclass → Validation columns** (on by default).
The same checks back `fileclass validate` on the [CLI](../cli/) and the API's
`validate()`.

## Embedding

Embed any base in a note with a native ` ```base ` code block — no Fileclass
code block is involved.
