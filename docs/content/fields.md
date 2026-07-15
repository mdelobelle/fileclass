---
title: "Fields & input"
weight: 30
---

Once a note is bound to a fileClass ([Schema layer](../schema/)), Fileclass gives
you typed, validated input for its fields. This page covers the first wave of
field types and the commands that set values. Everything is written to
**frontmatter only**, one `processFrontMatter` write per action.

## Available field types (wave A)

| Type | Stores | Input | Validation |
|------|--------|-------|------------|
| **Input** | text | text prompt | must be scalar text |
| **Number** | number | text prompt | numeric; optional `min`/`max` |
| **Boolean** | true/false | true/false picker | boolean |
| **Select** | one value | value picker | must be an allowed value (if a list is defined) |
| **Cycle** | one value | value picker | must be an allowed value |
| **Multi** | list | toggle list | each item must be allowed |
| **Date** | date | text prompt | `YYYY-MM-DD` (unless a custom format is set) |
| **DateTime** | date+time | text prompt | `YYYY-MM-DDTHH:mm` |
| **Time** | time | text prompt | `HH:mm` |

Empty values are always valid — a field is optional unless a constraint says
otherwise. `File`, `Media`, `Object`, `ObjectList`, `Lookup`, and `Formula`
arrive in later waves.

## Where allowed values come from

`Select`, `Cycle`, and `Multi` draw their allowed values from the field's option
source:

- **Inline list** — values listed directly in the field definition.
- **From a note** — the non-empty lines of a note (`valuesListNotePath`).
- **From a Base view** — replaces Metadata Menu's Dataview source; wired in a
  later wave. Until then such a field accepts free entry.

When no list is defined, the field accepts free text (and `Multi` accepts a
comma-separated entry).

## Commands

- **Fileclass: update a field in current file** — pick one of the note's fields
  and set its value with the type-appropriate input. The picker shows each
  field's current value.
- **Fileclass: insert missing fields in current file** — adds every root field
  of the note's fileClass(es) that isn't already in the frontmatter, each with an
  empty default, in a single write.

## Writing model

- All reads go through the metadata cache; all writes through
  `processFrontMatter`. No note text is parsed or edited.
- Each action is **one** write. Existing keys, key order, and unrelated
  frontmatter are preserved (see the migration notes on normalization).
- Clearing a field removes its key.
