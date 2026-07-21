---
title: "Fileclass"
---

# Fileclass

**Fileclass** gives your notes **typed, validated properties** — and helps you
fill them in correctly.

You define reusable **note types** (called *fileClasses*), each with a fixed set
of typed fields. For example, a **Book** type where:

- `author` must be a link to a Person note,
- `status` is one of *Reading* / *Read* / *Abandoned*,
- `rating` is a number from 1 to 5.

Every note of that type then gets **guided input** for those fields — dropdowns,
date pickers, link autocomplete — and Fileclass flags any note where a field is
missing or has the wrong type. In short, it's a **schema and input forms for your
frontmatter**: you define the fields and fill them in; the core **Bases** plugin
queries and displays them.

If you have used Notion databases or Metadata Menu, it is that idea — but
**frontmatter-only**, with **no Dataview dependency**.

It is the successor of [Metadata Menu](https://github.com/mdelobelle/metadatamenu)
(same author). Metadata Menu goes into maintenance mode; if you rely on Dataview
inline fields (`key:: value`), stay there.

## Documentation

- [Positioning](positioning/) — how Fileclass relates to core Properties, core
  Bases, and Metadata Menu, and who should use it.
- [Schema layer](schema/) — fileClass notes, fields, inheritance, and binding.
- [Fields & input](fields/) — typed, validated value input for every field type.
- [UI surfaces](ui/) — the note-fields modal, indicators, and property buttons.
- [Views](views/) — generating and syncing a `.base`, the editable table, and
  its validation columns.
- [CLI & API](cli/) — the public plugin API and the `fileclass` CLI/TUI:
  inspect, validate and edit typed frontmatter from the terminal.
- [Settings](settings/) — every setting explained.
- [Modeling guide](modeling/) — when to use a dedicated fileClass, a nested
  Object/ObjectList, or a free-form JSON/YAML field.

## Requirements

- Obsidian **1.12.7+** with the core **Bases** plugin enabled.
- Schema and typed input work without Bases; query-dependent features
  (File/Media fields, generated views) require it. These features rely on Bases
  internals validated on 1.13.2; on older versions they degrade gracefully
  (link fields fall back to all-files, the editable table view is skipped) rather
  than erroring.
