---
title: "Settings"
weight: 60
---

All settings live under **Settings → Fileclass**.

{{< video "001" >}}

## Core

| Setting | What it does |
|---------|--------------|
| **Class files folder** | Folder holding your fileClass notes. Any note here defines a fileClass (its name = the filename). |
| **fileClass alias** | Frontmatter key that binds a note to its fileClass(es). Default `fileClass`. |
| **Global fileClass** | A baseline carried by **every** note, on top of whatever classes it names itself; the note's own class wins any key both declare. Not applied to the class folder, whose notes declare classes rather than use them. Leave empty to disable. |
| **Bases folder** | Where generated `<fileClass>.base` files are written. |
| **fileClass icon** | Default icon for a fileClass without an explicit `icon` (each fileClass can override it, with a live preview + Lucide picker in its options). |
| **Default date format** | moment.js format a `Date` field is **written** in when it declares no format of its own (e.g. `DD/MM/YYYY`). Blank stores the ISO form `YYYY-MM-DD`. |
| **Default datetime format** | Same, for `DateTime` fields. Blank stores `YYYY-MM-DDTHH:mm`. |
| **Default time format** | Same, for `Time` fields. Blank stores `HH:mm`. |

Each of the three shows a live sample — `now → 30/07/2026` — and warns about
letters moment doesn't know, so a format is judged on what it writes.

## Behavior

| Setting | What it does |
|---------|--------------|
| **Validation columns** | Adds `valid` ✓/✗ and `errors` columns to the editable [`fileclass-table`](../views/#validation-columns) view, flagging notes that violate their schema. On by default. |
| **Canvas fields engine** | Auto-fills `Canvas`/`CanvasGroup`/`CanvasGroupLink` fields from `.canvas` files. This is the one surface that writes frontmatter automatically. |
| **Context menu entries** | Adds Fileclass actions to the file and editor right-click menus, and **Create a class** on the class-files folder. |
| **Insert fields when adding a class** | Binding a fileClass to a note adds its missing fields to the frontmatter straight away, instead of leaving you to run *Insert missing fields*. On by default. |
| **Reorder frontmatter when inserting fields** | After *Insert missing fields*, puts the note's properties back in the order its class declares them. **Off by default**: it rewrites the whole frontmatter block, so it touches lines you did not ask to edit and shows up in a git diff. The command **Reorder frontmatter to match the class** does it on demand whatever this says. |
| **Keys your classes don't declare** | Where a reorder puts properties no class knows about — `tags`, `aliases`, `cssclasses`, the `fileClass` key, anything hand-written. *First* (the default, where those already sit), *Last*, or *Where they are* — the last one moves only the keys your class declares, into the slots they already occupied. |
| **Property editor buttons** | Shows a per-field edit button (its type icon) in Obsidian's native Properties editor, for typed input — and, on the `fileClass` row, a wrench opening that class's schema. |
| **Movable modals (experimental)** | Drag a modal by its title, offset each modal opening over another, and dim the app once instead of once per modal. A stack stays last-in-first-out for the mouse as it already is for the keyboard: the topmost modal is the one that answers, the ones below are dimmed and inert, and they can still be dragged by their title. **Off by default**: it works by neutralising Obsidian's own full-window modal backdrops, a surface every plugin shares. Desktop only, and while modals are stacked an outside click closes nothing (Escape still closes the top one). |
| **Property section actions** | Adds **+ Add a class** beside Obsidian's *+ Add property*, plus **+ Insert *N* missing fields** when the note is missing any and **⇅ Reorder properties** when they are out of their class's order. On by default. |

## Indicators

A clickable icon next to a note's name that opens its fields (or, on a fileClass
note, its schema editor). Each surface has its own toggle:

| Setting | Surface |
|---------|---------|
| **Tab header**, **File explorer**, **Bookmarks** | next to the file name |
| **Backlinks pane**, **Bases first column** | next to each link |
| **Internal links** | after each link, in reading view and Live Preview |

Indicators are best-effort DOM decorations: if a surface changes in a future
Obsidian version the icon simply stops appearing there — the modal, menus, and
commands keep working.
