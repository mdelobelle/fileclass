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
| **Input** | text | text prompt (or [guided template](#input-templates)) | must be scalar text |
| **MultiInput** | list of text | list editor (add/remove/reorder; each item plain or [templated](#input-templates)) | a list of scalar text items |
| **Number** | number | number input (spinner, `min`/`max`/`step`) | numeric; optional `min`/`max` |
| **Boolean** | true/false | toggle | boolean |
| **Select** | one value | value picker | must be an allowed value (if a list is defined) |
| **Cycle** | one value | value picker | must be an allowed value |
| **Multi** | list | toggle list | each item must be allowed |
| **Date** | date | date picker | `YYYY-MM-DD` (unless a custom format is set) |
| **DateTime** | date+time | date-time picker | `YYYY-MM-DDTHH:mm` |
| **Time** | time | time picker | `HH:mm` |
| **Duration** | length of time | duration builder | an RFC 5545 `DURATION` (`P1W`, `PT1H30M`) |
| **MultiDuration** | list of durations | duration list editor | a list of durations |
| **File** | link | note picker | a link string |
| **MultiFile** | list of links | toggle list | a list of links |
| **Media** | link/embed | file picker | a link string |
| **MultiMedia** | list | toggle list | a list of links |
| **Object** | nested object | draft editor | each known child validates |
| **ObjectList** | list of objects | draft editor | each item's children validate |
| **JSON** | free-form value | monospace textarea | must parse as JSON |
| **YAML** | free-form value | monospace textarea | must parse as YAML |
| **Canvas** | list of links | auto-filled from a `.canvas` | — |
| **CanvasGroup** | list of group names | auto-filled from a `.canvas` | — |
| **CanvasGroupLink** | list of links | auto-filled from a `.canvas` | — |

Empty values are always valid — a field is optional unless a constraint says
otherwise. `Lookup` and `Formula` (computed fields) are **out of scope** for
Fileclass — use Bases views for reverse relations and computed columns.

## Required fields

Any field can be marked **Required** in the schema editor (the toggle sits with
the common field options, alongside the name and type). A required field with an
empty value is reported as a violation — everywhere validation surfaces:

- the [validation columns](../views/#validation-columns) of the editable
  `fileclass-table` view,
- `fileclass validate` on the [CLI](../cli/#cli-commands) (non-zero exit on any
  violation), and the API's `validate(scope)`, and
- `setValue` / `set-where`, which refuse to write an empty value into a required
  field.

Non-empty values keep their normal per-type validation (a number stays numeric,
a `Select` must still be an allowed value, and so on).

## Input templates

An `Input` field can define a **Template** in its options so its value follows a
fixed structure instead of being typed by hand. The template is a plain string
with placeholders:

- `{{name}}` → a free-text sub-input for that part.
- `{{name:["a","b"]}}` → a **dropdown** limited to that JSON array of choices.

For example, a `repository` field with the template
`https://github.com/{{user}}/{{repo}}/`, or a `price` field with
`{{amount}} {{unit:["gp","sp","cp"]}}`.

When a template is set, editing the field opens a **guided form** — one control
per placeholder plus a live **Result preview** you can still fine-tune by hand.
The stored value stays a **single text scalar** (the rendered string): a
templated `Input` is still an `Input`, with no computation and no Bases
dependency. A placeholder name that appears more than once is driven by a single
control. If a dropdown's choices aren't valid JSON, that part falls back to a
free-text input.

### MultiInput — a list of templated values

`MultiInput` is the list-valued counterpart of `Input`: it stores a **YAML list
of text scalars** (one per item) and **reuses the same Template option**. Editing
opens a list editor to **add / remove / reorder** items; each item is entered
through the same guided sub-form as `Input` (placeholder controls + preview), or
a plain prompt when no template is set. Blank items are dropped on save. Use it
when several values share one shape — e.g. a list of repository URLs from a
`https://github.com/{{user}}/{{repo}}/` template.

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

### Conditional candidates (dependent fields)

A link field's candidate list can depend on the value of **another field of the
note you are editing**. When the picker opens, Fileclass runs the bound Base view
with the current note as its context, so `this` inside the view's filters and
formulas resolves to that note — not only `this.file`, but its frontmatter
properties too (`this.<PropertyName>`). Write a view filter that compares each
candidate row against `this.<PropertyName>` and the list narrows to the rows that
match the note's current value.

For example, an `Objective` note has a `Goal` link field and a `Project` field,
and you want `Project` to offer only the projects attached to the goal already
chosen in `Goal`. In the projects `.base`, add a formula and a dedicated view:

```yaml
formulas:
  # true when this project's Goal is the same as the edited note's Goal
  isThisGoal: Goal.isTruthy() && this.Goal.isTruthy() && (file(Goal).basename == file(this.Goal).basename)
views:
  - type: table
    name: Goal's projects
    filters:
      and:
        - formula.isThisGoal == true
```

Then point the `Project` field at that view (`baseFile` + `viewName`). Note the
two distinct references: the **unqualified** `Goal` is each candidate row's own
property, while `this.Goal` is the `Goal` property of the note being edited — a
common pitfall is writing `this.file.basename` (the edited note's *name*) when
you meant `this.Goal` (its *field value*).

The `.isTruthy()` guards are not decorative: `file(x).basename` on an empty value
yields `null`, so a bare `file(Goal).basename == file(this.Goal).basename`
reduces to `null == null` — **`true`** — whenever both sides are empty. Without a
guard, opening the picker before the source field is set would surface every
candidate that *also* has an empty value. A single guard on either side removes
this false match; the example keeps both so it reads as "only when the edited
note has a Goal, match rows that share it".

Two requirements: the field the filter
depends on must be **saved first** (the picker reads it from the frontmatter, so
set `Goal` before opening `Project`), and after changing a field's bound view you
must **save the change in the fileClass settings** for the picker to use it.

> **Warning — the dependency is not reactive.** The source field only constrains
> the *candidate list shown when you open the picker*. A value already stored in
> the dependent field is **never revalidated, reset, or cleared** when you later
> change the source field. In the example above, if you edit `Goal` after having
> set `Project`, the existing `Project` value stays as-is even if that project no
> longer belongs to the new goal — leaving the note in an inconsistent state
> until you re-open and re-pick `Project` yourself.

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

## Durations & interval cycling

A `Duration` field stores a **length of time** as an RFC 5545 `DURATION` string —
unlike a `Time` field it doesn't wrap at 24h, so it fits prep times, effort
estimates, brew times, etc.:

```yaml
prep_time: PT1H30M   # 1 h 30 min
total_time: P1DT6H   # 1 day 6 h
brew: P2W            # 2 weeks
```

Editing opens a **builder**: either **type the duration** directly — ISO
(`PT1H30M`) or a human form (`1h 30m`, `2w`, `1 day 6 hours`) — or use the
weeks / days / hours / minutes / seconds spinners. The two stay in sync, with a
live compact preview (`1d 6h`); the stored value is always the canonical ISO
form. Output stays RFC-5545-valid (weeks stand alone; otherwise they fold into
days). No runtime dependency.

`MultiDuration` stores an **ordered list** of durations — an *interval sequence*.

### Set next date (spaced repetition)

This is how you schedule a date that moves forward by your own sequence of
intervals (spaced repetition, recurring reviews, chores):

1. Add a **`MultiDuration`** field (e.g. `next interval`) and enter your intervals
   in order — say `1 day`, `1 week`, `2 weeks`, `5 weeks`.
2. On a **`Date`** (or `DateTime`) field (e.g. `next session`), set its **Next
   interval field** option to that MultiDuration field's name.
3. Editing the date now shows a **Set next date** button. One click:
   - computes `current date + first interval`,
   - writes it to the date field, and
   - **rotates** the interval list so the next click uses the following interval,
     wrapping back to the first after the last.

So repeatedly clicking `next session` walks the date through `+1d`, `+1w`, `+2w`,
`+5w`, then `+1d` again. Pointing the option at a plain **`Duration`** field
instead gives a fixed interval (added every time, no rotation).

It is a **manual, one-shot action** — no automatic recomputation and nothing
touches other notes, so it stays within Fileclass's guided-input scope (computed
fields remain out of scope).

## Where allowed values come from

`Select`, `Cycle`, and `Multi` draw their allowed values from the field's option
source:

- **Inline list** — values listed directly in the field definition.
- **From a note** — the non-empty lines of a note (`valuesListNotePath`).
- **From a Base view** — the values come from a `.base` view (replaces Metadata
  Menu's Dataview source). By default they are the **matching files' names**; set
  a **Column** (e.g. `note.title`, a formula column) to use that column's
  distinct values instead. Requires the core Bases plugin; if it is unavailable
  the field falls back to free entry.

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

### Display template

Object/ObjectList fields have a **Display template** (in the schema editor)
controlling how an item is summarized in the modal and the list editor:

- `{{fieldName}}` — inserts a child field's display, e.g.
  `{{designation}} - {{ville}} - {{pays}}`.
- `{{dateField|FORMAT}}` — a **Date** child with a moment.js format override
  (e.g. `{{start|DD/MM/YYYY}}`); without an override, dates use the plugin's
  **Default date display format** (Settings → Fileclass), or the stored value if
  that is blank.
- A child that is itself an **Object** uses *its own* template (recursion).
- **No template** → the first non-empty child value.
- For **ObjectList**, each item's display is prefixed by its **rank** (`1.`, `2.`…).

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

## Canvas fields (Canvas / CanvasGroup / CanvasGroupLink)

These are **auto-maintained** from an Obsidian **`.canvas`** file — you don't
edit them; the **Canvas engine** derives their value from the canvas graph and
writes it to frontmatter whenever the canvas changes. Configure each field with
a **Canvas file** path (and, for `Canvas`/`CanvasGroupLink`, a **Direction**):

- **Canvas** — links to the notes connected to this note by edges in the canvas
  (following the chosen **Direction**: incoming / outgoing / both sides).
- **CanvasGroup** — the name(s) of the canvas group(s) this note sits inside.
- **CanvasGroupLink** — links to the notes connected to the group(s) this note
  is in.

Each field also has **conjunctive (AND) filters** in the schema editor:

- **Edge matching colors / from side / to side / labels** — only follow edges
  matching all set criteria (nothing set = any).
- **Node matching colors** — only keep target notes whose node has these colors.
- **Group matching colors / labels** (`CanvasGroup`/`CanvasGroupLink`).
- **Matching files** — restrict targets to the notes returned by a **`.base`
  view** (this replaces Metadata Menu's DataviewJS query — D1).

Unlike `Lookup`/`Formula`, this needs **no Dataview** and has **no Bases
equivalent** (Bases doesn't index canvas adjacency).

The engine watches `.canvas` edits, writes only when a value changed (no churn),
and clears fields on notes that dropped out of the canvas. It is the one surface
that writes frontmatter automatically — toggle it under **Settings → Fileclass →
Canvas fields engine**.

## Writing model

- All reads go through the metadata cache; all writes through
  `processFrontMatter`. No note text is parsed or edited.
- Each action is **one** write. Existing keys, key order, and unrelated
  frontmatter are preserved (see the migration notes on normalization).
- Clearing a field removes its key.
