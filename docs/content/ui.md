---
title: "UI surfaces"
weight: 40
---

Field editing is reachable from the UI, not only the command palette. This page
covers the note-fields modal and the context-menu entries (the first slice of
the UI surfaces; on-name indicators come later).

## Note-fields modal

The **note-fields modal** is the hub for a note's fields. It lists every root
field of the note's fileClass(es) with its current value and:

- **Edit** — opens the type-appropriate input (the same input used everywhere;
  nested Object/ObjectList fields open the draft editor).
- **Clear** — removes the field's value.
- **Insert missing fields** — adds any root fields absent from the frontmatter.
- **Add fileClass** — binds another fileClass to the note.

The modal refreshes automatically as values are written, so edits made through a
sub-modal appear immediately.

Open it with the command **Fileclass: manage note fields** or from a context
menu.

## Context menus

When **Context menu entries** is enabled (Settings → Fileclass), right-clicking a
Markdown file — in the file explorer, on a tab, or in the editor — adds:

- **Manage note fields** → the modal above.
- **Update a field** → pick one field and edit it.
- **Insert missing fields**.
- **Add fileClass**.

All actions write to frontmatter only, one `processFrontMatter` write each.

## Field indicator

A small clickable **icon** appears next to a note's name — in the **tab header**,
**file explorer**, and **bookmarks** — whenever a fileClass applies to it.
Clicking it opens the note-fields modal above. It is **icon-only**, and each
surface has its own toggle under **Settings → Fileclass → Indicators**.

The indicator is a best-effort UI decoration layered on Obsidian's DOM: if a
surface changes in a future Obsidian version, the icon simply stops appearing
there — the modal, menus, and commands keep working.

## Coming next

The same indicator on **internal links** (reading view, Live Preview, backlinks)
and in the **first column of Bases** tables.
