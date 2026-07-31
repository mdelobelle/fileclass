---
title: "Settings"
weight: 60
---

All settings live under **Settings → Fileclass**.

{{< video "001" >}}

## Core

| Setting | What it does |
|---------|--------------|
| **fileClass alias** | Frontmatter key that binds a note to its fileClass(es). Default `fileClass`. |
| **Global fileClass** | Applied to every note that has no other binding. Leave empty to disable. |
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
| **Property editor buttons** | Shows a per-field edit button (its type icon) in Obsidian's native Properties editor, for typed input. |

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
