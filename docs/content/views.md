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

It creates the base (filtered on the fileClass, with a table view listing
`file.name` and the fields) and records the choices on the fileClass
(`baseFile`/`baseView`). Pointing at an **existing** base is safe: only the
managed view is added or updated — your other views are left untouched.

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

> An editable **fileclass-table** view (in-cell editing through Fileclass's typed
> inputs) is being built next; generated bases will be able to use it.

## Embedding

Embed any base in a note with a native ` ```base ` code block — no Fileclass
code block is involved.
