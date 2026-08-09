---
title: "UI surfaces"
weight: 40
---

Field editing is reachable from the UI, not only the command palette. This page
covers the note-fields modal and the context-menu entries (the first slice of
the UI surfaces; on-name indicators come later).

## Note-fields modal

{{< video "026" >}}

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
explicit value — and on a date wired to an interval sequence, Alt-click advances
it instead of opening the picker.

**Alt-click a row's type icon** to open that field's **settings** — the same
definition editor the schema editor uses, addressed by field. Hold Alt over the icon
and it becomes a wrench, so the gesture announces itself. Changing one option of a
field you are looking at no longer means leaving the note, opening its fileClass and
finding the field again; the write goes to the fileClass note that *declares* the
field, which for an inherited one is the ancestor.

Header actions: **Insert missing fields** (adds any root fields absent from the
frontmatter) and **Add fileClass** (binds another fileClass to the note).

The modal refreshes automatically as values are written, so edits made through a
sub-modal appear immediately.

Its **footer** shows the fileClass(es) applying to the note as an **inheritance
breadcrumb** (`ancestor › parent › fileClass`). Each name is **clickable** — it
opens [that fileClass's editor](../schema/#editing-a-fileclass), the same screen the
note's indicator icon and the fileClass's right-click menu open, stacked over the
note so closing it brings you back. On **hover**, a name marks the rows of the fields
that fileClass declares with a vertical bar, so you can see which fileClass owns
which field (inherited fields point at the ancestor that declares them).

When the note does **not** name the class itself, the crumb says where it came from —
`Media › Book (from /Reading list)`, `(from #album)`, `(from *Film club)`. Three of the four
binding routes leave nothing in the file, so without this a note can carry a class with an
empty frontmatter and no way to find out which option, on which class, claimed it.

It works **both ways**: hovering a field's row marks, in the footer, the class that
declares it — the same accent bar, laid under the name. So "what does this class give
me?" and "where does this field come from?" are the same gesture, read in either
direction. An ancestor is marked in every breadcrumb it appears in, since `Media` under
`Book` and `Media` under `Album` are the same declaration.

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
| `Date`/`DateTime` with a [next interval](../fields/#set-next-date-spaced-repetition) | opens the picker | writes the **next date** |
| everything else | opens the type's **input** | — |

Alt is always "the gesture the click doesn't do". For a `Cycle` the click writes,
so Alt opens the picker; for a date it is the other way round. While you hold Alt
over a date's control, its calendar icon becomes a **skip-forward** and its
tooltip names the date it would write (`Set "review" to 2026-10-29 (+90d)`) — the
value is read at that moment, so it is never a stale promise.

Before this, a `Cycle` advanced in the note-fields modal but opened a picker
everywhere else — under a `rotate-cw` icon that promised the advance. A control's
icon now tells you what will happen, wherever you click it.

## Adding list values from the keyboard

Every editor that builds a list — a `Select`/`Cycle`/`Multi` **values list**,
**duration presets**, the items of a `MultiInput` or a `CycleDuration` — chains
without the mouse:

- **Add value** (or *Add preset* / *Add item*) puts the caret straight in the new
  row's input.
- **Enter** hands focus back to that Add button.

So a list is typed as `Add`, text, <kbd>Enter</kbd>, <kbd>Enter</kbd>, text,
<kbd>Enter</kbd>… and you decide when to stop, because focus rests on the button
rather than opening a row you didn't ask for. Rows entered through their own modal
(a duration, a templated item) behave the same: the modal opens focused, Enter
saves it, and focus returns to the Add button.

**<kbd>Alt</kbd>+<kbd>Enter</kbd> runs the modal's primary action** — *Save*, *Add
field*, *Apply* — from wherever the caret is, so finishing a form never needs a
Tab hunt or the mouse. It reads the same way as Alt everywhere else in the plugin:
the gesture the plain key doesn't do. Plain <kbd>Enter</kbd> keeps its local
meaning (submit this input, or move to the Add button); only Fileclass's own
modals answer the chord.

## Context menus

{{< video "027" >}}

When **Context menu entries** is enabled (Settings → Fileclass), right-clicking a
Markdown file — in the file explorer, on a tab, or in the editor — adds:

- **Manage note fields** → the modal above.
- **Update a field** → pick one field and edit it.
- **Insert missing fields**.
- **Reorder properties** — only when the note's keys are out of its class's order.
- **Add fileClass** — which also inserts that class's fields, unless you turn
  [**Insert fields when adding a class**](../settings/#behavior) off.
- **Open *&lt;class&gt;* schema** — one entry per fileClass that applies to the note,
  named. This matters for a class bound by **tag, path, bookmark or Base view**:
  those leave no value in the frontmatter to click, so the menu — and the breadcrumb
  at the bottom of the [note-fields modal](#note-fields-modal) — are how you reach
  the class at all.

On a **fileClass note**, the menu instead offers schema actions plus **Bulk edit
a field of this fileClass** (see below).

Right-clicking the **class-files folder** itself offers **Create a class** — the
command palette isn't the only door to a new fileClass, and the folder is where one
naturally looks for it.

All actions write to frontmatter only, one `processFrontMatter` write each.

## Insert missing fields across a class

{{< video "030c" >}}

*Insert missing fields* is a per-note command, which is what you want on the note in front of
you and useless the day a class gains a field: every note written before it keeps a gap, and
closing it meant opening each one. [Bulk edit](#bulk-edit-set-where) could set a value
everywhere but never add the key.

**Fileclass: insert missing fields across a class** — also on a fileClass note's right-click
menu — counts first: how many notes are missing how many fields, then the list, note by note,
with what each one lacks. *Not now* leaves everything as it is; confirming writes once and
reports a single total rather than one notice per note.

It asks the index, not the frontmatter, so a note **claimed by a folder, a tag or a bookmark
group** is included even though no `fileClass` line names it — those are precisely the ones
nobody remembers. Templates are included too, and should be: a template is a note of the class
like any other (see [creating notes with a
template](../schema/#creating-notes-with-a-template-templater--templates)).

The keys arrive **empty**, as they do note by note: a key with nothing in it, which is exactly
what a [required field](../fields/#required-fields) then flags.

## Bulk edit (set-where)

{{< video "030" >}}

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

## Moving a modal out of the way

**Experimental, and off by default** — turn on *Movable modals* in Settings → Fileclass.
The behaviour works by neutralising Obsidian's own full-window modal backdrops, which every
plugin shares, so it stays opt-in until it has been lived with. Desktop only.

A modal is centred, and what it covers is often what you are filling it in from — the
note's own properties, a base's rows, the value behind it. **Drag a modal by its title**
to move it; the cursor over the title says so. It cannot be dropped out of reach: a
recognisable piece of it always stays on screen, and its title never goes above the top
edge, since that is what you would grab to bring it back.

A modal opening **over** another lands slightly off it — down and to the right — so a
stack reads as a stack and you can still see, and grab, the one underneath. The offset
stops growing after a few levels, and dragging a modal replaces it.

Position is per-modal and not remembered: the next one you open is centred again.

**Only the topmost modal of a stack answers the mouse** — the ones below are dimmed and
inert, which is what the keyboard already did: Obsidian traps focus in the last modal
opened, and <kbd>Escape</kbd> closes that one. These modals hold drafts, so reaching into
the one underneath while a child is open would let the child's Save write over a draft you
had since changed.

**They can still be moved**, by their title: rearranging what you can see is the point of
the setting, and moving a modal changes nothing in it. A background window you may drag but
not act inside.

Stacked modals also **dim the app once**, not once per modal: three of them used to darken
the window three times over and wash out the ones below.

One consequence, deliberate: **while modals are stacked, clicking the dim area closes
nothing** — otherwise the click would fall through to the bottom modal, the one the others
were opened from. A single modal still closes on an outside click, and <kbd>Escape</kbd>
always closes the top one.

**Desktop only.** On mobile the handle would have to take over touch gestures on the
title, which would cost you scrolling the modal with your thumb — a real loss for a
gesture that isn't worth much on a phone.

## Unsaved changes

A modal that holds a draft — a field's definition, a group's values, a list's items —
says so as soon as the draft differs from what it opened on: **Unsaved changes**
appears at the left of its footer, on the same line as Save — the footer is pinned, so
the warning stays on screen however long the list is. Closing it then asks rather than discarding, with the
three answers that exist: **Keep editing**, **Discard**, or **Save**. That covers
Escape, the close button and a click outside, since Obsidian routes all three through
the same close.

A modal you haven't changed still closes on Escape without a word.

## Moving through a field list

Every modal that lists rows carrying the same actions is navigated with the arrow
keys — the **note-fields modal**, the **schema editor**, the same list scoped to an
[object's children](../fields/#nested-fields-object--objectlist), and the **value
editors** of an `Object` and an `ObjectList`:

| key | effect |
|-----|--------|
| ↓ / ↑ | the **same action** on the next / previous field |
| → / ← | the next / previous action of that field |
| Home / End | the first / last field, keeping the action |
| Enter or Space | activates it, as any button |

The list is a **single tab stop**: Tab reaches it, the arrows move inside it, Tab
leaves for the footer. A class of a dozen fields used to put fifty-five stops between
you and the Save button.

Moving down keeps the *action*, not the column: a group field carries an extra
**Children** button, so ↓ from *Edit* lands on *Edit* — never on *Remove*.

## Field indicator

{{< video "029" >}}

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

{{< video "028" >}}

In Obsidian's native **Properties** editor, each row whose key matches an
**editable field** of the note's fileClass gets a small **button between the key
and the value**, carrying the field's type icon. Clicking it performs [that type's
gesture](#one-gesture-per-field-type) — a `Cycle` advances, a `Boolean` flips,
everything else opens the type-appropriate input with its validation, instead of
Obsidian's untyped value cell. **Alt-click** always opens the input.

**Editing the field rather than its value**: **right-click** any of these buttons and
that field's own definition opens — its type, its options — from the panel where you
noticed the problem. Not Alt: on this button Alt already opens a type's picker, and a
modifier that means two things depending on the type is worse than one that means one.
In the [note-fields modal](#note-fields-modal) the type icon and the action button are
two separate elements, so there Alt over the icon is what opens the definition. Auto-
maintained fields (Canvas family) and computed types get no button. Toggle it
under **Settings → Fileclass → Property editor buttons**.

The **`fileClass` row** gets a different button: a **wrench opening that class's
schema**, one per class the row lists. The stored value is an identifier, not a
wikilink — binding can also come from a tag, a path or a Base view — so there was
nothing to click through to, and reaching the class definition meant finding it in
the class folder. Where the button lands depends on how Obsidian types the
property, which is its decision and not the plugin's: a **List** property renders
each value as a pill and the wrench sits inside it, right after the name; a
**Text** property fills the row, so the wrench takes its place in the icon column
between the key and the value. A name matching no class gets no button — which is
also how a typo announces itself.

Like the indicators, this is a best-effort DOM decoration (Obsidian exposes no
API for it): if the properties DOM changes, the buttons simply stop appearing and
everything else keeps working.

## Property section actions

Next to Obsidian's **+ Add property**, on the same line, Fileclass adds:

- **+ Add a class** — opens the fileClass picker, the same one as the command and
  the context menu. Always available, whether the note already has a class or not
  (a note may bind several).
- **+ Insert *N* missing fields** — appears **only when the note is missing
  some**, names how many, and lists them in its tooltip. Clicking inserts them
  all with empty values, in one write.

The second button's absence is the useful half of the design: when it isn't
there, the note is complete. It is never a button whose only outcome is "nothing
to insert" — which, since binding a class inserts its fields automatically
(*Insert fields when adding a class*, on by default), is what it would show most
of the time.

A third, **Reorder properties**, appears only when a note's keys are out of the
order its class declares.

### On a fileClass note

Its **`fields` row** reads *N fields* behind a wrench that opens the schema. A
class's fields are a list of objects, which Obsidian has no editor for, so the
panel printed the raw JSON in the warning colour it keeps for values nobody can
interpret — on the one note where that value is the subject. The count is what
the class declares at its top level; the tooltip adds how many live inside
objects.

A class note gets the actions that act on the **class**, not on the note — and
not *Add a class*, which there would bind a class to a class:

- **+ Add a field** — opens the schema editor with its *Add field* dialog
  already up, so the new field lands in a list you are looking at.
- **Options** — what the class [extends](../schema/#extending-a-fileclass), what
  it excludes, and the [notes it claims](../schema/#binding-notes-to-a-fileclass).
- **Create a base** / **Modify the base** — the
  [generator](../views/#generating-a-base), prefilled. It reads **Sync the base**,
  in the accent colour, while the class and its table disagree — a field added,
  renamed or moved since the table was written — and clicking it then syncs
  straight away instead of reopening the generator. Nothing polls: the check runs
  when the class's shape changes under your eyes.
- **Open the base** — only once the class has one, and it goes straight there.
- **Bulk edit a field** — [set one field](#bulk-edit-set-where) across the notes
  that carry the class.

Both sets sit in the properties section, so they follow Obsidian's own rule
for showing it: a note with **no frontmatter at all** displays no properties
section, and therefore no buttons — use the command palette, the right-click menu
or the [field indicator](#field-indicator) to bind the first class. Toggle the
pair under **Settings → Fileclass → Property section actions**.
