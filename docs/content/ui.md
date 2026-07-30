---
title: "UI surfaces"
weight: 40
---

Field editing is reachable from the UI, not only the command palette. This page
covers the note-fields modal and the context-menu entries (the first slice of
the UI surfaces; on-name indicators come later).

## Note-fields modal

The **note-fields modal** is the hub for a note's fields. It lists every root
field of the note's fileClass(es) — each row is compact, with the field's **type
shown as a leading icon** (hover it for the type name) and its current value.

Right-side actions follow the [one gesture per
type](#one-gesture-per-field-type) rule:

- **Boolean** — a **toggle** flips the value directly.
- **Cycle** — a **next** button rotates to the next allowed value.
- other editable types — **Edit**, the type-appropriate input (the same input
  used everywhere; nested Object/ObjectList fields open the draft editor).
- computed (Lookup) and auto-maintained (Canvas) types — no edit action.
- **Clear** (all) — removes the field's value.

**Alt-click** a toggle or a next button to open the input instead, and set an
explicit value.

Header actions: **Insert missing fields** (adds any root fields absent from the
frontmatter) and **Add fileClass** (binds another fileClass to the note).

The modal refreshes automatically as values are written, so edits made through a
sub-modal appear immediately.

Its **footer** shows the fileClass(es) applying to the note as an **inheritance
breadcrumb** (`ancestor › parent › fileClass`). Each name is **clickable** (opens
that fileClass's schema editor) and, on **hover**, marks the rows of the fields
that fileClass declares with a vertical bar — so you can see which fileClass owns
which field (inherited fields point at the ancestor that declares them).

Open it with the command **Fileclass: manage note fields** or from a context
menu.

## One gesture per field type

{{< video "006" >}}

A field's type decides what a control *does*, and every surface performs the same
gesture: the buttons in the Properties editor, a cell of the editable
[table view](../views/#editable-table-view), and the note-fields modal.

| Type | Click | Alt-click |
| ---- | ----- | --------- |
| `Cycle` | writes the **next allowed value** | opens the value picker |
| `Boolean` | **flips** true/false | opens the switch |
| everything else | opens the type's **input** | — |

Before this, a `Cycle` advanced in the note-fields modal but opened a picker
everywhere else — under a `rotate-cw` icon that promised the advance. A control's
icon now tells you what will happen, wherever you click it.

## Context menus

When **Context menu entries** is enabled (Settings → Fileclass), right-clicking a
Markdown file — in the file explorer, on a tab, or in the editor — adds:

- **Manage note fields** → the modal above.
- **Update a field** → pick one field and edit it.
- **Insert missing fields**.
- **Add fileClass**.

On a **fileClass note**, the menu instead offers schema actions plus **Bulk edit
a field of this fileClass** (see below).

All actions write to frontmatter only, one `processFrontMatter` write each.

## Bulk edit (set-where)

**Fileclass: bulk edit a field** (command, or the fileClass note's right-click
menu) sets one field across many notes at once — the in-app counterpart of the
CLI's `set-where`:

1. Pick the **fileClass**.
2. Optionally **filter** which of its notes to touch — a **field condition**
   (e.g. `status is empty`) or a **base view** (only notes the view matches;
   needs the core Bases plugin).
3. Pick the **field to set** and its **new value** through that field's own typed
   input (the same picker used everywhere), then **Preview**.
4. A second window lists **every** note that would change (`old → new`), each with
   a **toggle** (on by default). Turn off any you want to leave alone — the button
   shows how many will be written, e.g. **Apply (23)**.
5. **Apply** writes only the kept rows. Each is validated; notes already at the
   target value are skipped.

> Dry-run first: nothing is written until you Apply. As always, writes go
> straight to your vault — keep regular backups.

## Field indicator

A small clickable **icon** appears next to a note's name whenever a fileClass
applies to it; clicking it opens the note-fields modal above. On a **fileClass
note** itself (in the tab header or file explorer), the icon instead opens the
**schema editor** (manage its options and fields). The icon is the fileClass's
own `icon` (a Lucide icon name, inherited from a parent fileClass if unset,
falling back to the configured default). Each surface has its own toggle under
**Settings → Fileclass → Indicators**:

- **Tab header**, **file explorer**, **bookmarks** — next to the file name.
- **Backlinks pane** and the **first column of Bases** tables — next to each link.
- **Internal links** in reading view **and Live Preview** — after each link.

The indicator is a best-effort UI decoration layered on Obsidian's DOM (and, for
Live Preview, its CodeMirror editor): if a surface changes in a future Obsidian
version, the icon simply stops appearing there — the modal, menus, and commands
keep working.

## Property editor buttons

In Obsidian's native **Properties** editor, each row whose key matches an
**editable field** of the note's fileClass gets a small **button between the key
and the value**, carrying the field's type icon. Clicking it performs [that type's
gesture](#one-gesture-per-field-type) — a `Cycle` advances, a `Boolean` flips,
everything else opens the type-appropriate input with its validation, instead of
Obsidian's untyped value cell. **Alt-click** always opens the input. Auto-
maintained fields (Canvas family) and computed types get no button. Toggle it
under **Settings → Fileclass → Property editor buttons**.

Like the indicators, this is a best-effort DOM decoration (Obsidian exposes no
API for it): if the properties DOM changes, the buttons simply stop appearing and
everything else keeps working.
