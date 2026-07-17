---
title: "Fields & input"
weight: 30
---

Once a note is bound to a fileClass ([Schema layer](../schema/)), Fileclass gives
you typed, validated input for its fields. This page covers the first wave of
field types and the commands that set values. Everything is written to
**frontmatter only**, one `processFrontMatter` write per action.

## Available field types

| Type | Stores | Input | Validation |
|------|--------|-------|------------|
| **Input** | text | text prompt | must be scalar text |
| **Number** | number | number input (spinner, `min`/`max`/`step`) | numeric; optional `min`/`max` |
| **Boolean** | true/false | toggle | boolean |
| **Select** | one value | value picker | must be an allowed value (if a list is defined) |
| **Cycle** | one value | value picker | must be an allowed value |
| **Multi** | list | toggle list | each item must be allowed |
| **Date** | date | date picker | `YYYY-MM-DD` (unless a custom format is set) |
| **DateTime** | date+time | date-time picker | `YYYY-MM-DDTHH:mm` |
| **Time** | time | time picker | `HH:mm` |
| **File** | link | note picker | a link string |
| **MultiFile** | list of links | toggle list | a list of links |
| **Media** | link/embed | file picker | a link string |
| **MultiMedia** | list | toggle list | a list of links |
| **Object** | nested object | draft editor | each known child validates |
| **ObjectList** | list of objects | draft editor | each item's children validate |
| **JSON** | free-form value | monospace textarea | must parse as JSON |
| **YAML** | free-form value | monospace textarea | must parse as YAML |

Empty values are always valid — a field is optional unless a constraint says
otherwise. `Lookup` and `Formula` (computed fields) are **out of scope** for
Fileclass — use Bases views for reverse relations and computed columns.
`Canvas`/`CanvasGroup`/`CanvasGroupLink` are a separate, planned feature (see
below).

## Link fields (File / Media)

`File`, `MultiFile`, `Media`, and `MultiMedia` store wikilinks. Their **candidate
list comes from a Base view** — configure the field with a `.base` file and view
(`baseFile` + `viewName`); this replaces Metadata Menu's Dataview query and Media
folders. An optional `displayColumn` (a base column id such as `note.title`) sets
the alias shown in the picker and written into the link.

- When no base is configured, or the core Bases plugin is unavailable, the picker
  gracefully falls back to **all notes** (File) or **all media files** (Media).
- `Media`/`MultiMedia` with the `embed` option store an embed (`![[…]]`).
- Links honor your vault's link settings (`generateMarkdownLink`).

## Date fields (Date / DateTime / Time)

Editing a date opens a **native picker** (calendar / clock) with **Today** and
**Clear** buttons, plus a **link toggle**:

- **Raw text** (default) — stores the formatted date, e.g. `2026-07-16`.
- **As link** — stores a wikilink, e.g. `[[2026-07-16]]` or, with a **Link path**
  set, `[[Journal/2026-07-16]]`. Configure the default state (**Insert as link**)
  and the **Link path** in the schema editor.

Set a custom **`dateFormat`** (moment.js tokens) to store any format; otherwise
the ISO default above is used. If the **Natural Language Dates** plugin is
installed, an extra field parses phrases like *"next friday"* into the picker.

## Where allowed values come from

`Select`, `Cycle`, and `Multi` draw their allowed values from the field's option
source:

- **Inline list** — values listed directly in the field definition.
- **From a note** — the non-empty lines of a note (`valuesListNotePath`).
- **From a Base view** — the names of the files a `.base` view matches (replaces
  Metadata Menu's Dataview source). Requires the core Bases plugin; if it is
  unavailable the field falls back to free entry.

When no list is defined, the field accepts free text (and `Multi` accepts a
comma-separated entry).

## Commands

- **Fileclass: update a field in current file** — pick one of the note's fields
  and set its value with the type-appropriate input. The picker shows each
  field's current value.
- **Fileclass: insert missing fields in current file** — adds every root field
  of the note's fileClass(es) that isn't already in the frontmatter, each with an
  empty default, in a single write.

## Nested fields (Object / ObjectList)

An **Object** field groups typed sub-fields into a nested structure; an
**ObjectList** is an array of such objects. Sub-fields are declared in the same
fileClass with a `path` pointing at their parent — nesting can go several levels
deep.

Editing opens a **draft editor**:

- You edit a working copy in memory. **Cancel writes nothing.**
- **Save** validates the whole draft, then writes the entire subtree in a
  **single** `processFrontMatter` call.
- The editor mutates a clone of your existing value, so **unknown keys are
  preserved** — Fileclass never regenerates an object from the schema.
- ObjectList items can be added, edited, reordered, and removed.

Only **root** fields appear in the field picker; nested fields are reached by
editing their parent object.

## Structured fields (JSON / YAML)

**JSON** and **YAML** hold a **free-form nested value** with no declared schema —
the escape hatch for structures Object/ObjectList don't model. Editing opens a
**monospace textarea** (Cmd/Ctrl+Enter saves); the text must parse as JSON (resp.
YAML) or the modal shows the parser error. The parsed value is written to
frontmatter as-is; clearing the text removes the field.

Use Object/ObjectList when the shape is known and you want typed, guided input;
use JSON/YAML for arbitrary or externally-defined blobs. For the fuller decision
— including when the data deserves a fileClass of its own instead — see the
[Modeling guide](../modeling/).

## Canvas fields (planned)

`Canvas`, `CanvasGroup`, and `CanvasGroupLink` derive their value from a
`.canvas` file's graph (nodes/edges/groups) — e.g. links to the notes connected
to this one, or the canvas group it belongs to. Unlike `Lookup`/`Formula`, they
need **no Dataview** and have **no Bases equivalent** (Bases doesn't index canvas
adjacency), so they are a **planned dedicated feature**: an event-driven engine
that watches `.canvas` edits and writes the derived links back to frontmatter.
Their type is already parsed and preserved; the auto-maintenance engine is not
implemented yet.

## Writing model

- All reads go through the metadata cache; all writes through
  `processFrontMatter`. No note text is parsed or edited.
- Each action is **one** write. Existing keys, key order, and unrelated
  frontmatter are preserved (see the migration notes on normalization).
- Clearing a field removes its key.
