---
title: "Views"
weight: 50
---

Fileclass delegates querying and display to the core **Bases** plugin — it does
not ship its own table engine. To see and browse the notes of a fileClass, you
use a `.base` file; Fileclass helps you create one.

## Generating a base

Run **Fileclass: create a base for a fileClass**, or **right-click a fileClass
note** → **Create a base for this fileClass**. A small dialog lets you choose:

- the **base file** path (new or existing; defaults to
  `<basesFolder>/<FileClass>.base`, the folder set in **Settings → Fileclass →
  Bases folder**), and
- the **view name** — the managed view (defaults to the fileClass name).

It creates the base — filtered on the fileClass, with an **editable
`fileclass-table` view** (see below) listing `file.name` and the fields — and
records the choices on the fileClass (`baseFile`/`baseView`). Pointing at an
**existing** base is safe: only the managed view is added or updated — your other
views are left untouched.

Once a base exists, the right-click menu on the fileClass note changes:

- **Modify base for this fileClass** — reopens the same dialog (create/sync) on
  the existing base.
- **Open base for this fileClass** — opens the `.base` in a new tab. There's also
  the command **Fileclass: open this fileClass's base**.

## Keeping a base in sync

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
fileClass to its base**.

> The sync round-trips the YAML, which reformats the file and drops YAML
> comments — fine for the plugin-managed base.

## Editable table view

Fileclass registers a Bases view type, **`fileclass-table`**, that renders like a
table but lets you **edit cells in place**: clicking a `note.<field>` cell opens
the field's typed input (the same one used everywhere) and writes the value —
`file.*` and `formula.*` cells stay read-only.

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
