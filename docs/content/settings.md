---
title: "Settings"
weight: 60
---

All settings live under **Settings → Fileclass**.

## Core

| Setting | What it does |
|---------|--------------|
| **Class files folder** | Folder holding your fileClass notes. Any note here defines a fileClass (its name = the filename). |
| **fileClass alias** | Frontmatter key that binds a note to its fileClass(es). Default `fileClass`. |
| **Global fileClass** | Applied to every note that has no other binding. Leave empty to disable. |
| **Bases folder** | Where generated `<fileClass>.base` files are written. |
| **fileClass icon** | Default icon for a fileClass without an explicit `icon` (each fileClass can override it, with a live preview + Lucide picker in its options). |
| **Default date display format** | moment.js format for showing `Date` values (e.g. `LL`, `DD/MM/YYYY`). Blank shows the stored value. Object display templates can override it per field with `{{field\|FORMAT}}`. |

## Behavior

| Setting | What it does |
|---------|--------------|
| **Canvas fields engine** | Auto-fills `Canvas`/`CanvasGroup`/`CanvasGroupLink` fields from `.canvas` files. This is the one surface that writes frontmatter automatically. |
| **Context menu entries** | Adds Fileclass actions to the file and editor right-click menus. |
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
