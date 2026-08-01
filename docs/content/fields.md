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
| **Number** | number | text prompt with − / + buttons stepping by `step` ([details](#number-fields)) | numeric; optional `min`/`max` |
| **Boolean** | true/false | toggle | boolean |
| **Select** | one value | value picker | must be an allowed value (if a list is defined) |
| **Cycle** | one value | one click advances to the next value ([details](../ui/#one-gesture-per-field-type)) | must be an allowed value |
| **Multi** | list | toggle list | each item must be allowed |
| **Date** | date | date picker | `YYYY-MM-DD` (unless a custom format is set) |
| **DateTime** | date+time | date-time picker | `YYYY-MM-DDTHH:mm` |
| **Time** | time | time picker | `HH:mm` |
| **Duration** | length of time | duration builder | an RFC 5545 `DURATION` (`P1W`, `PT1H30M`) |
| **CycleDuration** | list of durations | duration list editor | a list of durations |
| **Location** | `"lat,lon"` | coordinate inputs + paste | lat −90..90, lon −180..180 |
| **Icon** | icon id | [searchable icon grid](#icon) | a registered icon id |
| **Color** | CSS color | [swatch palette + custom](#color) | a valid CSS color |
| **File** | link | note picker | a link string |
| **MultiFile** | list of links | toggle list | a list of links |
| **Media** | link | file picker (with thumbnails) | a link string |
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

### One value or several

Four of those types hold a **list** rather than a scalar, and they split by who
decides what may go in it. `Multi` offers the values the class allows, as a switch
each — **clicking anywhere on a row flips it**, not just the switch — and stores
them **in the order the class declares**, not the order you picked them.

Every multi-select opens with a **filter box**, focused, so a list of hundreds is
narrowed by typing rather than by scrolling. <kbd>Enter</kbd> flips the first match
and clears the box, which chains: type, Enter, type, Enter. Filtering only changes
what is *shown* — values ticked while hidden are still saved.

Two controls make a long list survivable in the other direction, when the problem is
undoing rather than finding:

- the icon at the end of the filter row shows **only the ticked values**, turning a
  list of hundreds into the handful you actually chose;
- **Unselect all** (bottom left, carrying the count) unticks **everything** — not
  just what the filter shows, which is why it names the number it is about to clear.

In "only ticked" mode a row you untick stays where it is instead of vanishing under
the pointer; the list settles the next time you type or leave the mode. `MultiInput` takes a list nobody can enumerate in advance: you type
each item, reorder them, and blank rows are dropped on save. Either way the
frontmatter gets a plain YAML list, so a base can filter on it.

{{< video "011" >}}

`Boolean` is the simplest of them: no options, a switch for input, and a real
`true`/`false` in the frontmatter, which Obsidian renders as a checkbox in its own
properties editor. Note that an **empty** boolean is not `false` — it says nothing,
which is why *insert missing fields* leaves it blank rather than guessing.

{{< video "005" >}}

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

## Number fields

{{< video "003" >}}

`Number` stores a real number in the frontmatter — `pages: 412`, not `pages: "412"` —
so a base can sort, filter and total it.

Its options are **Min**, **Max** and **Step**. The input is a plain text field with
its own **−** and **+** buttons (and the ↑/↓ keys) stepping by `step`, 1 by default:

- on an **empty field the first − or + shows `Min`** itself (0 when no minimum is
  set), whichever button you press — one click, one value the field accepts — and
  the buttons step normally from there;
- the value is **clamped** to `Min`/`Max`, and a fractional step stays clean —
  stepping 0.1 by 0.2 gives 0.3, not 0.30000000000000004.

Typing is never blocked: enter `twelve` and the field keeps it, then validation
refuses the save with *"pages" must be a number*. A native number input would have
dropped those keystrokes silently, leaving an empty field and no explanation.

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

{{< video "012" >}}

`File`, `MultiFile`, `Media`, and `MultiMedia` store wikilinks. Their **candidate
list comes from a Base view** — configure the field with a `.base` file and view
(`baseFile` + `viewName`); this replaces Metadata Menu's Dataview query and Media
folders. An optional `displayColumn` (a base column id such as `note.title`) sets
the alias shown in the picker and written into the link.

- Candidates appear in the **view's own order** — its `sort:` (then `groupBy`
  flow) — so the picker matches how the base reads, instead of an arbitrary
  order. A `limit:` on the source view also applies. The same holds for
  `Select`/`Multi` fields sourced from a base.
- When the source view defines a **`groupBy`**, the picker shows those **groups**:
  headers in the single-pick suggester (they keep delimiting the list as you
  type) and section headers in the multi-pick list. The keyless group (files with
  no value for the grouping property) reads **(No value)**.
- When no base is configured, or the core Bases plugin is unavailable, the picker
  gracefully falls back to **all notes** (File) or **all media files** (Media).
- `MultiFile`/`MultiMedia` pick **several** at once: the same switch list as a
  `Multi` field (a click anywhere on a row flips it), pre-ticked with what the note
  already holds. The stored order is the **view's**, not the order you switched
  them on — so a sorted view gives sorted links.

{{< video "013" >}}
- The value is always a **plain link**, never an embed (`![[…]]`). Metadata Menu
  offered that, and it made sense there: its fields could live **inline in the note
  body**, where an embed renders. In frontmatter it renders nothing — and worse,
  Obsidian doesn't register an embedded value as a link, so **renaming the image
  leaves it dangling** (a plain link is rewritten for you), it is absent from the
  graph, and a Bases `image` column ignores it. Values already stored as embeds keep
  resolving everywhere Fileclass reads them.
- An **image value shows as a thumbnail** wherever Fileclass displays it — in the
  picker, so a cover is chosen by looking at it rather than by reading
  `cover-final-2.png`, and beside the value in the note-fields modal, the
  Properties row and a table cell. A list shows its first three. Images only: the
  media types also accept audio, video and PDF, and there is no honest thumbnail
  for those.

{{< video "014" >}}
- Links honor your vault's link settings (`generateMarkdownLink`).

### Conditional candidates (dependent fields)

A link field's candidate list can depend on the value of **another field of the
note you are editing** — and Fileclass writes the plumbing for you.

In the field's options, under the base and view, set:

- **Depends on another field** — the field of this fileClass whose value narrows the
  list. Only single-valued fields are offered: comparing a list to a scalar needs a
  different predicate (see [by hand](#writing-the-predicate-by-hand) below).
- **Match on property** — the property on the *candidate* side to compare against
  it. It defaults to the source field's name, which is the usual case.

A preview shows the view that will be created and the formula behind it, so you see
the predicate before saving rather than discovering it later inside the `.base`. On
save, Fileclass adds them to the bound base and points the field at the generated
view — **a narrowed copy of the view you chose**, keeping its filters, sort and
order:

```yaml
formulas:
  fcMatch_publisher_by_publisher: publisher.isTruthy() && this.publisher.isTruthy() && (publisher == this.publisher)
views:
  - type: table
    name: All series            # yours, untouched
    filters:
      and:
        - fileClass == "Series"
    sort:
      - property: started
        direction: ASC
  - type: table
    name: "Fileclass · All series · publisher = this.publisher"
    filters:
      and:
        - fileClass == "Series"                            # the scope, inherited
        - formula.fcMatch_publisher_by_publisher == true    # the predicate, added
    sort:
      - property: started
        direction: ASC
```

Four things worth knowing about what it generates:

- it **narrows your view rather than replacing it**. That scope matters: a generated
  view filtered on the formula alone would match anything in the vault sharing the
  value — a comic published by Casterman would show up among Casterman's series;
- the comparison shape follows the **source field's type**: a link field is compared
  by basename, anything else by value;
- the view's name carries the scope it narrows, so two fields narrowing different
  views the same way don't collide, while the **formula** is named after the
  predicate alone and is shared;
- your base is otherwise untouched — other views, other formulas, and the tuning
  inside the generated view (column widths, say) all survive a regeneration.

A field whose candidates are notes of its own fileClass will **offer the edited note
itself**; add `file != this.file` to the generated view if that bothers you.

### Writing the predicate by hand

Still available, and still the way to express what the builder doesn't — a
multi-valued source (`this.<field>.contains(…)`), or a comparison the two types
don't agree on. When the picker opens, Fileclass runs the bound Base view
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

{{< video "008" >}}

Three types for three questions: `Date` is a day, `DateTime` a **point in time** (a
day and a clock in one value), `Time` a **time of day** with no day attached — the
hour a door opens, every session. Each is stored in its own native form —
`YYYY-MM-DD`, `YYYY-MM-DD[T]HH:mm`, `HH:mm` — and has its own default write format in
the settings.

Editing a date opens a **native picker** (calendar / clock) with **Today** and
**Clear** buttons, plus a **link toggle**:

- **Raw text** (default) — stores the formatted date, e.g. `2026-07-16`.
- **As link** — stores a wikilink, e.g. `[[2026-07-16]]` or, with a **Link path**
  set, `[[Journal/2026-07-16]]`. Configure the default state (**Insert as link**),
  the **Link path** and the **Link alias** in the schema editor.

### Linking to a daily note

The **Link path** may contain **braced moment tokens**, which follow the date — so
a link can be filed the way daily notes usually are. Only what's inside the braces
is formatted, which is why the literal words survive (a raw moment format would
read the `D` of `Daily` as a day number):

| Field format | Link path | Link alias | Stored value |
| ------------ | --------- | ---------- | ------------ |
| *(ISO)* | `Journal/` | off | `[[Journal/2026-07-30]]` |
| `YYYY-MM-DD ddd` | `Daily/Notes/{{YYYY}}/{{MM}}/` | off | `[[Daily/Notes/2026/07/2026-07-30 Thu]]` |
| `YYYY-MM-DD ddd` | `Daily/Notes/{{YYYY}}/{{MM}}/` | **on** | `[[Daily/Notes/2026/07/2026-07-30 Thu\|2026-07-30 Thu]]` |

**Link alias** writes `[[path/date|date]]`, so the link reads as the date instead
of its whole path. It is skipped when there is no path — `[[2026-07-30|2026-07-30]]`
would say nothing twice.

### Which format is written

{{< video "007" >}}

Three levels, first one wins:

1. the field's own **Date format** (moment.js tokens), set in the schema editor;
2. the plugin-wide default for that type — [**Default date format**, **Default
   datetime format**, **Default time format**](../settings/#core). The field
   editor names the one that applies: *"Blank uses default: DD/MM/YYYY"*;
3. blank everywhere → the native ISO form (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`,
   `HH:mm`).

Every input where a format is typed — the three settings and a field's own **Date
format** — shows **what today's date looks like through it** (`now → 30/07/2026`)
and flags what moment can't read: `YYYY-KK-007` warns that `"KK"` is not a token
and would be written as-is (wrap literal text in `[brackets]`). The **Link path**
gets the same treatment, previewing the whole wikilink it would write today.

All three decide **what is written to the file**. Nothing reformats a date for
display: a stored date is shown exactly as it sits in the frontmatter (an
insert-as-link value included). The one exception is an object display template,
which may ask for a format per token — `{{released|YYYY}}`.

That is deliberate: how a date is stored in your vault is your call. Store
`30/07/2026`, or a wikilink to a daily note, and recover ordering in a base with a
formula (`date(...)`) when you need to sort or filter on it.

### Obsidian's own property type can overwrite your format

Obsidian keeps its **own** type for each property (Settings → Properties, or the
menu on a property row). If you set a property to Obsidian's **Date** type and then
edit it with **Obsidian's** date picker rather than Fileclass's, Obsidian writes
its own `YYYY-MM-DD` form — whatever the field's format says, and dropping a
wikilink value.

Fileclass can't prevent that: property-type widgets are global and per-*type* in
Obsidian, so the plugin has no way to intercept the native picker for one field
without hijacking every date property in the vault. Keep such properties on
Obsidian's **Text** type and edit them through Fileclass's button, which is the
one that knows your format.

If the **Natural Language Dates** plugin is installed, an extra field parses
phrases like *"next friday"* into the picker.

## Durations & interval cycling

{{< video "009" >}}

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

A field can also define **preset durations** in its schema (a list you build
once). They then appear as **quick picks** when entering a value: a one-click
button on a `Duration` field, and chips you tap to append on a `CycleDuration`
list (you can still reorder, add a custom one, or repeat a preset). Presets are
a convenience — values are still stored per note.

### An interval sequence (`CycleDuration`)

{{< video "010" >}}

`CycleDuration` stores an **ordered list** of durations — an *interval sequence*. The
order is the schedule: it is what a linked date field walks through, one interval per
click. Its **presets** are the class's vocabulary of spans (say 90, 180 and 360 days
for a re-read cycle); the sequence itself is each note's own composition — two of
them, all three, or the same one twice.

### Set next date (spaced repetition)

{{< video "010b" >}}

This is how you schedule a date that moves forward by your own sequence of
intervals (spaced repetition, recurring reviews, chores):

1. Add a **`CycleDuration`** field (e.g. `next interval`) and enter your intervals
   in order — say `1 day`, `1 week`, `2 weeks`, `5 weeks`.
2. On a **`Date`** (or `DateTime`) field (e.g. `next session`), open its **Next
   interval field** option and pick that field. The dropdown lists the
   `Duration` and `CycleDuration` fields of the fileClass — its own and its
   inherited ones — so there is no name to remember and no incompatible type to
   choose by mistake. Leave it on `(none)` for a plain date.
3. Editing the date now shows a **Set next date** button. One click:
   - computes `current date + first interval` — from the date already stored,
     falling back to today when the field is empty,
   - writes it to the date field, and
   - **rotates** the interval list so the next click uses the following interval,
     wrapping back to the first after the last.

   The picker closes on success, so each step of the schedule is one deliberate
   gesture.
4. Or skip the picker: **Alt-click the date's control** — in the Properties
   editor, the note-fields modal or a table cell — and it advances straight away.
   Holding Alt over the control shows the date it would write.

So repeatedly clicking `next session` walks the date through `+1d`, `+1w`, `+2w`,
`+5w`, then `+1d` again. Pointing the option at a plain **`Duration`** field
instead gives a fixed interval (added every time, no rotation).

Whichever route you take, the date is stored **exactly as the picker would store
it**: the field's own `dateFormat`, and its link shape when the field defaults to
links or already holds one — so a `[[Daily/Notes/2026/10/2026-10-29 Thu|…]]` stays
a link instead of collapsing to a bare date.

If the option was set and the interval field has since been renamed, retyped or
removed, the dropdown keeps that name and marks it `(not found)`: the stored
value isn't dropped behind your back, and the missing **Set next date** button
now has a visible reason.

It is a **manual, one-shot action** — no automatic recomputation and nothing
touches other notes, so it stays within Fileclass's guided-input scope (computed
fields remain out of scope).

## Location

A `Location` field stores geographic coordinates as a **`"lat,lon"`** scalar
(the core Bases Map view / Map View plugin convention):

```yaml
location: "48.8566,2.3522"
```

Editing gives two **range-validated** number fields (latitude −90..90, longitude
−180..180) plus a **paste** box that accepts a `"lat,lon"` string and fills them.
**Open in map** opens the coordinates on OpenStreetMap in your browser.

> **No embedded map picker.** An in-app map means loading remote tiles, which is
> against Fileclass's no-remote-resources stance (and an Electron `<webview>`
> proved unstable). To pick a new spot, use **Open in map** or any map site in
> your browser, then copy the `lat,lon` from the URL and paste it here.

Because the value uses the standard `"lat,lon"` convention, a note with a
`Location` field is picked up **automatically** by the core **Bases Map view**
and the community **Map View** plugin — Fileclass just makes the property easy to
enter correctly; it does not generate map views itself.

## Icon

An `Icon` field stores an icon **id** (a single scalar), chosen from a visual
picker:

```yaml
icon: map-pin
```

Editing opens a **searchable grid** of real icon previews; click one to pick it,
or clear the value. The icons come from an extensible **source** (field option
**Icon source**): **Lucide** (the default, bundled with Obsidian) or **all
registered icons** (Lucide plus any icon other plugins register). Rendering uses
Obsidian's `getIconIds()` / `setIcon()` — no bundled icon list, no dependency.

The stored value is the **bare id** (`map-pin`, not `lucide-map-pin`). Naming an
`Icon` field `icon` (with Lucide icons) lets the core **Bases Map view** use it
as the marker icon — Fileclass just makes the property easy to enter.

## Color

A `Color` field stores a **CSS color** value (a single scalar):

```yaml
color: "#fb464c"
```

Editing opens a picker with **palette swatches** (field option **Color source** —
the Obsidian **Canvas** palette by default; extensible to more palettes) plus a
**custom color**: a native color input and a text field accepting any CSS value
(hex, `rgb()`, or a color name). Click a swatch to pick it, or clear the value.
Uses a native input + CSS — no dependency.

Like `Icon`, the palette is a picker convenience; the stored value is a raw CSS
color. Naming a `Color` field `color` lets the core **Bases Map view** use it as
the marker color.

## Where allowed values come from

{{< video "004" >}}

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
