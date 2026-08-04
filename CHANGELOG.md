# Changelog

All notable changes to Fileclass are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Modals can be moved.** A modal is centred, and what it hides is often what you need to
  read while filling it in. Drag one **by its title**; the cursor over the title says so.
  It can't be lost: a recognisable piece always stays on screen — 120px, chosen by looking
  at 48px and finding that the modal read as *gone* — and the title never goes above the
  top edge, since that is what you would grab to bring it back. Position isn't remembered:
  the next modal opens centred. **Desktop only**, because the handle would otherwise take
  over touch gestures on the title and cost you scrolling a modal with your thumb.

## [0.2.6] - 2026-08-04

### Changed

- **A `JSON` field stores JSON.** It used to parse your text and hand the *structure* to
  frontmatter, which Obsidian then wrote as YAML — so nothing on disk was ever JSON and the
  type was a notation for the editor only. A `JSON` field now stores the **text**, which
  Obsidian writes as a block scalar (`tech: |-`), so a payload keeps the formatting it came
  with. Measured: a multi-line string is emitted as a block, a block already in the file
  survives a write elsewhere in the note untouched, and the cache gives the exact text back.
  The trade-off is the point of having two types: **YAML** stores a real structure, which a
  base can reach into through a formula; **JSON** keeps the bytes and is opaque to Bases. A
  field that already holds a mapping keeps working — it opens as pretty-printed JSON, and
  becomes text on the next save.

### Added

- **Convert between the two notations, when it applies.** Changing a field's type doesn't
  rewrite what it holds, so a `JSON` field can open on YAML (and the reverse). The editor
  then offers *Convert from YAML* — and the offer appears and disappears as you type, since
  it is only ever shown for text that reads as the other notation.

### Added

- **A duration reads as a duration in Obsidian's Properties panel.** `PT45M44S` is the
  right thing on disk and unreadable on screen, so the human form is now shown next to the
  stored value — never over it: Obsidian's value there stays editable, and overwriting its
  text would risk writing `45m 44s` back into your frontmatter. A single value gets its
  reading beside it; an **interval sequence gets one reading inside each pill**, just left
  of the pill's remove button, so it names the value it reads instead of summarising the
  list from a distance. Surfaces that already read well — the note-fields modal, a field
  menu — show nothing extra, and the editable `fileclass-table` gains the reading like the
  panel.

- **A field's edit button stays on the property's first line.** It was centred in the row,
  so on a property whose value is a stacked list it drifted to the middle line, away from
  the name it acts on.

### Fixed

- **Raw text no longer disappears on Escape.** The `JSON`/`YAML` editor is where the most
  typing happens and it was the last one without a guard: Escape or the close button threw
  a blob away in silence. It now shows **Unsaved changes** in its footer and asks — *Keep
  editing*, *Discard* or *Save* — like every other editor since 0.2.4.

- **The parser answers while you type.** An invalid document was only reported when you
  asked to save, so a mistake twenty lines up was learned about on the way out. The error
  — with its line, its column and a caret under the spot — now appears as you type, and an
  empty box stays what it is: the way to clear the field.

### Changed

- **A declared raw field is not a warning.** Obsidian paints a nested value it can't
  interpret in its warning colour. That is right for a value nobody can make sense of and
  wrong for a `JSON`/`YAML` field a class declares and round-trips through an editor — as
  it already was for groups. The value itself stays raw on screen, which for these two
  types is the honest answer.

- **A structured value says how much is inside.** `{…}` told you nothing; a value now
  reads as **3 keys** or **5 items** wherever there is no room to show it whole.

## [0.2.5] - 2026-08-03

### Fixed

- **A property control acts on the note in front of you.** Obsidian recycles the rows of
  its Properties panel — switching notes keeps the elements and rewrites their contents —
  and Fileclass only rebuilt its button when the property *name* changed. So on two notes
  sharing a property, the button stayed behind with the first note captured inside it:
  the `editions` control of one book opened another book's list (reported from a real
  vault), and a `Cycle` or a `Boolean` would have written to the wrong note **in
  silence**, with no modal to show it. The note and the field are now read from the row
  at the moment of the click, and the button is rebuilt when either the note or the
  field's type changes — which also keeps its icon and its label honest.

- **A child field whose name matches a root field no longer disappears.** A class holds
  its nested children in the same list as its root fields, told apart by their `path`,
  and the resolver de-duplicated that list by **name alone**. So a `Book` with a
  `publisher` and an `editions` list whose items each have their own `publisher` lost
  the child: it was absent from the resolved schema, and nothing offered it when adding
  an item — reported from a real vault. A field is now identified by its name **at its
  level**, so the same word can name a root field and a child of a group. Overriding an
  inherited child still works, at its own level. `excludes` follow the same rule: they
  name a field of a class, which is a root field, and a group's children go with their
  parent rather than with a word.

- **An item you start and abandon is no longer written.** *Add item* on an `ObjectList`
  pushed an empty item into the draft **before** opening its editor, and cancelling that
  editor didn't take it back: nothing showed it — the list still read two rows, the
  *Unsaved changes* line stayed quiet — and the next Save wrote `{}` into the
  frontmatter, where it came back as a phantom third item. An item now exists only once
  its editor is saved.

- **An empty item reads as empty, not as punctuation.** With a display template, an item
  holding nothing rendered as the template's own separators — a lone `·` — which reads
  as a value. A template with nothing to fill it now renders nothing, so the surfaces
  say *(empty)* in their own words, and a list summarises such an item as
  `2. (empty)` rather than as a bare rank.

## [0.2.4] - 2026-08-03

### Fixed

- **A group's children are reachable from the field itself.** *Children* was a button
  on the schema screen only, so the other doors into a field's definition — Alt-clicking
  its type icon in the note-fields modal, above all — could not get to them. The field's
  own settings now carry the action, for `Object` and `ObjectList`, and it appears as
  soon as you pick one of those types rather than after a save and a detour.

- **The first row's focus ring is no longer cut off.** A modal's title is sticky with
  an opaque background, so it painted *over* the top of the ring on the first field —
  not a clipping problem but an overlap, which is why it only ever affected that one
  row. The field list keeps room for it now, and `scroll-padding` means a row the arrow
  keys scroll to doesn't park under the title either.

- **The breadcrumb names the group you are in.** Editing the children of a nested
  group said *Book › children* at every depth, so two levels of nesting looked
  identical — and the children of a group are exactly where you need to know which
  group. It now reads *Comic › storage › shelf › children*, and the field editor's
  title names the field instead of saying "Edit field".

- **Closing a modal with unsaved changes asks instead of discarding.** Nothing said
  whether Save was needed, so Escape or the close button threw a half-filled field
  definition away in silence. A modal holding a draft now shows **Unsaved changes** at
  the left of its pinned footer, on the Save button's line, the moment the draft differs
  from what it opened on — so a long list can't scroll the warning out of sight — and
  closing it offers *Keep editing*, *Discard* or *Save* — Escape, the X and a click
  outside all go through the same door. An untouched modal still closes without a word.
  So far: a field's definition, a group's values, and an `ObjectList`'s items.

- **The arrow keys move through a field list.** Every row of the schema editor
  contributes four or five tab stops — fifty-five in a class of a dozen fields — so
  reaching the eighth field's *Edit* was thirty-odd presses of Tab. ↓ / ↑ now move to
  the same action on the next field, → / ← between that field's actions, Home / End to
  the ends, and the whole list is a single tab stop. Moving down keeps the *action*,
  not the column: a group carries an extra **Children** button, so ↓ from *Edit* lands
  on *Edit* rather than sliding onto *Remove*. Every modal that lists rows carrying the
  same actions has it: the note-fields modal, the schema editor, an object's children
  list, and the value editors of an `Object` and an `ObjectList`.

- **A valid group is no longer painted as a warning.** Obsidian can't interpret a
  nested property, so it colours the value in `--text-warning` — right for a value
  nobody can make sense of, wrong for a group a fileClass declares and validates. The
  warning colour is dropped when the field is an `Object`/`ObjectList` **and** the
  value passes validation; a group that doesn't keeps it, because there the warning is
  the truth.

- **A group's display template now reaches Obsidian's Properties panel.** A nested
  property showed there as raw JSON — `{"name":"Chilton Books","city":"Philadelphia"}`
  — while every Fileclass surface showed the template's summary. When a display
  template is set, the panel shows that summary too, keeping the JSON in the tooltip.
  Obsidian types a mapping as `unknown` and renders it read-only, so nothing editable
  is replaced; without a template, the panel is left exactly as it was.

- **A value that isn't a group is no longer thrown away.** Give a field the `Object`
  type and the value it already held — a plain string, say `publisher: Chilton Books`
  — became invisible: the row showed nothing, validation called it fine, the editor
  opened empty, and the next save replaced it with `{}` without a word. It is now
  shown wherever values show, reported as a violation ("must be a group of
  properties"), displayed in the editor as **Current value, not a group yet**, and
  kept when you save an empty group — removing it takes an explicit *Clear*. Same for
  `ObjectList`, whole and per item.

## [0.2.3] - 2026-08-03

### Fixed

- **The coordinates box reads what you actually paste.** It accepted the canonical
  `lat,lon` and nothing else — a Google or Apple Maps link, an OpenStreetMap link, a
  `geo:` URI, a degree-marked pair like `48.8584° N, 2.2945° E`, even a space between
  the two numbers all filled **nothing at all, without a word**. All of those are read
  now; text that holds no pair says so, and a pair that is off the globe is told apart
  from one that couldn't be read, because those are different mistakes.

- **The "Set next date" button had no label.** `setIcon()` on an Obsidian button
  replaces its content, so the text set just before it never rendered: the picker
  showed an icon with no name — nothing on hover, nothing for a screen reader. It
  reads *Set next date* again, with a tooltip; the skip-forward icon stays where it
  belongs, on the field's own control under Alt.

- **Colour pickers open the way Obsidian's own does.** Every colour control was an
  invisible `<input type="color">` (`opacity: 0`, absolutely positioned) inside a
  `<label>` that activated it — and opening its popover from the settings window
  emptied the settings pane behind it, leaving the tab selected with nothing in it.
  Obsidian's accent-colour setting, which behaves, is a plain **visible** input
  sitting directly in its row; ours are now the same thing, shaped into the same
  circles by CSS, with the "add" mark moved to a corner badge that never takes the
  click. The swatch inside each one fills a square box, so it is a circle rather than
  the ellipse a 50% radius draws on Obsidian's 26x22 default, and the two pickers in
  a field's palette keep their distinct rings — dashed for *add to my colors*,
  rainbow for a one-off shade — with the chosen colour inset inside them. Three places changed: the palette in the settings, the field picker, and
  the canvas colour options.

- **The icon picker shows the icon you already have.** It renders 240 of some 1900
  icons in alphabetical order, so a value like `rocket` was simply absent from the
  first screen: the picker never displayed the value it was editing, and you had to
  search for what you already had in order to see it. The current icon and its id now
  sit above the search box, and the grid still marks it when it comes into view.

## [0.2.2] - 2026-08-02

### Fixed

- **A templated field shows the value you already had.** The guided form's preview is
  the value being built, and the first control you touch rewrites it — so for a value
  that predates the template, and therefore fills no control, the preview was the only
  copy of it and it vanished on the first keystroke. The stored value now sits above
  the controls as **Current value**, selectable and never rewritten.

- **Editing one part of a templated value no longer wipes the others.** The guided
  form for a templated `Input` opened with blank controls, so touching any of them
  re-rendered the template from empty parts: correcting the shelf number in
  `Study · A-3` stored ` · -7` and lost the room. The form now reads the stored value
  back into its parts — literals escaped, one capture per placeholder, a dropdown
  matched against its own choices — and a value that doesn't fit the template still
  falls back to empty controls, as before.

## [0.2.1] - 2026-08-02

### Fixed

- **A generated base returned nothing for a class bound by folder or tag.** The
  managed view filtered on the class property alone — `fileClass == "Author"` — and
  a note bound by **Files paths** or by tag carries no such property, so the view
  was empty for every folder-mapped class. The filter now matches every binding it
  can express: the property, `file.inFolder()` per mapped folder (by prefix, so
  subfolders count — an equality on the folder missed them), and `file.hasTag()` per
  tag, `or`-ed together. Bases generated before their class was mapped are repaired
  on the next sync, unless their filter was edited by hand, in which case it is left
  alone. Bookmark groups and Base-view bindings have no Bases equivalent and stay
  outside the filter; the docs say which.

- **A nested tag now binds to the class its parent tag maps.** A note tagged
  `#author/french` was left untyped while a class mapped on `author` claimed
  `#author`, and the generated view listed it anyway — Bases' `file.hasTag()`
  includes children, as do Obsidian's tag search and tag pane. The resolver now
  matches a tag and every tag it nests under, most specific first, so the view and
  the binding agree. More notes are typed; none loses its typing.

- **The `Template` option said what it was, not what it wasn't.** It read *"compose
  each value from fixed parts"* — which is what someone defining a list of allowed
  values believes they want — and never mentioned `Select`/`Multi`. Both the setting
  and the docs now name the two types that limit a field to values you choose,
  before explaining template syntax.

- **Turning Bases on after Fileclass no longer needs a restart.** Feature detection
  ran once, at layout-ready, and nothing re-ran it: a vault where the core Bases
  plugin was switched on later kept File/Media candidates and generated views
  disabled for the rest of the session, with no way to tell why. Fileclass now
  re-detects whenever a core plugin is toggled.

- **A generated base could report `Unknown view type: fileclass-table`.** The
  editable view is registered once, when Bases is available; a session that missed
  that moment rendered every base Fileclass had generated as an error — on a file
  Fileclass wrote itself. Registration is retried whenever Bases becomes available,
  and a failure is logged instead of being swallowed. (The view type still needs
  Fileclass enabled to render, as any plugin-provided Bases view does.)

## [0.2.0] - 2026-08-01

### UI

- **A field's settings, one Alt-click from the note.** In the note-fields modal, Alt
  over a row's type icon turns it into a wrench and Alt-clicking it opens that
  field's definition editor. Changing one option of a field you are looking at used
  to mean leaving the note, opening its fileClass and finding the field again. The
  write goes to the fileClass note that declares it — the ancestor, for an inherited
  field — and a dependent field's formula is regenerated from this door too.

- **A dependent field builds its own filter** (#19). Pick the field to depend on and
  the property to match, and Fileclass writes the formula into the bound base and
  points the field at a **narrowed copy of the view you chose** — its filters, sort
  and order, plus the predicate — with a preview of both before you save.
  Hand-authoring that meant knowing `this.<Property>` resolves to the edited note,
  choosing a value or a link comparison, and remembering the `.isTruthy()` guards
  without which an empty-vs-empty comparison is `true` and the picker offers every
  value-less candidate. Names come from the predicate, so regenerating converges
  instead of accumulating, and everything else in the base is left alone.

- **Removed: the `embed` option** on `Media`/`MultiMedia`. It wrote `![[cover.png]]`
  instead of `[[cover.png]]`, which made sense in Metadata Menu — its fields could
  live **inline in the note body**, where an embed renders. In frontmatter it renders
  nothing, and the marker costs you three things, all measured: Obsidian doesn't
  register an embedded value as a link, so **a rename leaves it dangling** while a
  plain link is rewritten; it is absent from the graph; and a Bases `image` column
  shows nothing for it. Values already stored as embeds keep resolving wherever
  Fileclass reads them — thumbnails, candidates, pre-selection.

- **Image values show as thumbnails** — in the `Media`/`MultiMedia` picker, and
  beside the value in the note-fields modal, the Properties row and table cells. A
  media field points at a picture; every surface used to show its file name.

- **Focus rings are no longer clipped** in Fileclass's modals. Their bodies scroll,
  which clips sideways too, and a switch at the right edge sat flush against it —
  the ring of a keyboard-focused toggle was cut off. The bodies now carry
  horizontal padding.
- **Unselect all, and a "only ticked" filter**, for the other half of a long list:
  finding a value was the filter box, undoing a dozen was still one click each. The
  icon at the end of the filter row narrows the list to what is ticked; the footer
  button clears everything and names the count, since it also clears what the filter
  hides.
- **A filter box at the top of every multi-select**, focused on open, so hundreds
  of values are narrowed by typing instead of scrolling. Enter flips the first
  match and clears the box, chaining type-Enter-type-Enter. Filtering is display
  only: a value ticked while hidden is still saved.
- **A picker over hundreds of values scrolls and hovers smoothly.** No virtual
  list: `content-visibility` lets the engine skip off-screen rows, so selection,
  pre-ticked state and find-in-page keep working on real DOM. Measured on a
  500-value list — a style recalc of the picker, which every hover pays, went from
  24-43 ms to 8-13 ms, and the worst scroll frame from 90 ms to 9 ms.

- **A multi-select row toggles wherever you click it**, not only on the switch —
  which is a small target in a column of them, while the label is where the eye
  already is. The hovered row is banded so the label and its switch read as one
  target. Applies to every `Multi`, `MultiFile` and `MultiMedia` picker.
- **Fixed: the View and Display-column suggesters stayed open** after you chose a
  value, while Base file closed properly. Selecting fires an `input` event so the
  setting picks the value up, and that event re-queries the suggestions: a
  synchronous source resolves before the popover closes, an awaited one resolves
  after and reopened it.

- **Reach a class's schema from a note bound to it** (#23). The `fileClass` row of
  the Properties editor gets a wrench per class — inside the pill when Obsidian
  types the property as a list, in the icon column when it types it as text — and
  the note's context menu lists *Open &lt;class&gt; schema* for each class that applies,
  including those bound by tag, path or Base view, which leave no value to click.
  The stored value stays a plain identifier: this only adds navigation.

- **Alt+Enter runs a modal's primary action** — *Save*, *Add field*, *Apply* —
  wherever the focus is, so a form filled from the keyboard is submitted from the
  keyboard. Fileclass's own modals only; Obsidian's are untouched.

- **Values lists read as one block.** The rows of a values list or of duration
  presets no longer carry a separator between them, and the last input is no longer
  glued to the line below it: Obsidian collapses the padding of a `.setting-item`
  that is first or last *in its parent*, which fired inside the wrapper div holding
  those rows. Same repair for the last of a field's type options.

- **List editors chain from the keyboard.** Adding a value, a duration preset or a
  list item now puts the caret in the new row, and Enter hands focus back to the
  Add button — so a values list is typed `Add`, text, Enter, Enter, text, Enter
  instead of one mouse trip per row. The duration input also accepts **Enter to
  save**, which it didn't: the chain used to stop there.

- **Alt-click a date to advance it.** A `Date`/`DateTime` field with a *Next
  interval field* now takes its **Set next date** action straight from any control
  — Properties button, note-fields modal, table cell — without opening the picker.
  Hold Alt over the control and its calendar icon becomes a skip-forward, with the
  date it would write in the tooltip. Same rule as everywhere else: Alt performs
  the gesture the click doesn't.
- **Fixed: "Set next date" ignored the field's format.** It wrote a bare ISO date,
  so a field formatted `YYYY-MM-DD ddd` — or stored as a `[[daily note]]` link —
  lost its shape as soon as the schedule advanced. Both routes now go through one
  write rule, shared with the picker's Save.

- **Two actions beside "Add property"**: the Properties section now offers
  **+ Add a class** and, when the note is missing any, **+ Insert *N* missing
  fields** — named with the count and the field names in its tooltip. Binding a
  class or completing a note no longer needs the command palette while you are
  already looking at the frontmatter. Toggle: *Property section actions*.

- **`Next interval field` is a dropdown**: a `Date`/`DateTime` field now picks the
  interval that drives its **Set next date** button from the fileClass's own and
  inherited `Duration`/`CycleDuration` fields, instead of taking a typed name. A
  wrong name used to fail in silence — the button simply never appeared. A stored
  name that matches no field is kept and marked `(not found)` rather than dropped.

- **One screen for a fileClass, whichever door you use.** Clicking a fileClass in the
  footer of a note's fields modal used to open an intermediate modal offering *Open
  fileClass settings* / *Create base view* — a fork that existed nowhere else, while
  the icon and the right-click menu went straight to the editor. The breadcrumb now
  opens that editor too, and the editor carries the class-level actions its
  right-click menu already had: **Options…**, create or modify its base, open that
  base (disabled until one exists), and bulk edit one of its fields. The intermediate
  modal is gone, and nothing it offered was lost.

- **"Create a class" on the class-files folder.** Right-clicking the folder that
  holds your fileClasses now offers it, so a new class no longer needs the command
  palette — the folder is where one looks for it. (The entry follows the *Context
  menu entries* setting, and appears on that folder only, not on the notes inside
  it.)
- **Binding a class now fills the note.** *Add a class to this note* used to write
  the binding and stop there, leaving every new note one command short of usable;
  it now inserts the class's missing fields in the same gesture. The index rebuilds
  on a debounce after a frontmatter write, so the insertion waits for the binding to
  be visible rather than acting on a stale resolution, and gives up quietly if it
  never is — the explicit command stays available. Turn it off with **Insert fields
  when adding a class** (Settings → Fileclass → Behavior).


- **One gesture per field type, on every control.** A `Cycle` advanced to its next
  value in the note-fields modal but opened a value picker everywhere else — in the
  Properties editor and in editable table cells — under a `rotate-cw` icon that
  promised the advance. The gesture is now decided by the type alone and shared by
  all three surfaces: `Cycle` writes the next allowed value, `Boolean` flips, every
  other type opens its typed input. **Alt-click** opens the input wherever the
  gesture writes a value directly, so an explicit choice is always one modifier
  away. The button's label names what it will do ("Next value", "Toggle", "Edit")
  instead of a generic *Edit*.

### Settings

- **Date formats show what they write, and say when they're wrong.** Every input
  that takes a moment format — the three defaults above and a field's own **Date
  format** — now renders today's date through it (`now → 30/07/2026`), and reports
  letters moment doesn't know: typing `YYYY-KK-007` warns that `"KK"` is not a
  token and would be written verbatim. moment itself never complains, which is how
  a typo used to reach the frontmatter unnoticed. The **Link path** previews the
  whole wikilink it would write today, tokens expanded.

- **`Default date display format` becomes `Default date format`, and decides what
  is *written*** — plus **`Default datetime format`** and **`Default time
  format`**, one per date type. A `Date`/`DateTime`/`Time` field with no format of
  its own is now stored in the default for its type (blank = the native ISO form),
  and the field editor names the fallback in place: *"momentjs format. Blank uses
  default: DD/MM/YYYY"*. Symmetrically, **nothing reformats a date for display any
  more**: a stored date is shown exactly as the file holds it. How a date is
  written is a deliberate choice — ISO, `DD/MM/YYYY`, a wikilink to a daily note —
  and ordering is recovered in a base with a `date(...)` formula.

  Two consequences worth knowing. The old setting's value is **not** carried over:
  it used to change the display only, so inheriting it would have silently started
  rewriting dates in a human format. And the same setting no longer applies to all
  three types at once — a date-shaped format used to turn every `Time` value into
  today's date on screen.

### Fields

- **Date links can follow the date, and carry an alias.** A `Date` field stored as
  a link could only prepend a fixed folder (`[[Journal/2026-07-30]]`), so it
  couldn't reach a daily note filed under its year and month, and the link
  displayed its whole path. **Link path** now expands **braced moment tokens** —
  `Daily/Notes/{{YYYY}}/{{MM}}/` — and a new **Link alias** option writes
  `[[path/date|date]]`, giving
  `[[Daily/Notes/2026/07/2026-07-30 Thu|2026-07-30 Thu]]`. Only what's inside the
  braces is formatted, so literal words survive (a raw moment format would read the
  `D` of `Daily` as a day number). The alias is skipped when there is no path.

- **Number input: typing works, and it has − / + buttons.** The prompt used a
  native `type="number"` input, which silently discards every non-numeric
  keystroke: typing `twelve` looked like a dead field, and the field's own
  validation never got the chance to explain itself. It is now a text input with a
  numeric keypad hint, so what you type stays and the refusal is spelled out
  (*"pages" must be a number*). It also gained **−** and **+** buttons, and ↑/↓
  keys, stepping by the field's `step` (1 by default). On an empty field the first
  click shows `Min` itself (0 when there is no minimum), so it always lands on a
  legal value; the result is clamped to `Min`/`Max`, and a fractional step stays
  clean (0.1 + 0.2 → 0.3).

## [0.1.1] - 2026-07-26

### UI

- **In-app bulk field edit** ([#56](https://github.com/mdelobelle/fileclass/issues/56)):
  a new **Fileclass: bulk edit a field** command (and a fileClass note's
  right-click entry) sets one field across many notes without the CLI. Pick a
  fileClass, an optional filter (a field condition or a base view), the field and
  a new value through its own typed input, then **preview** — a second window
  lists every affected note (`old → new`) with a per-note toggle (on by default)
  and an **Apply (N)** button that writes only the kept rows. Dry-run by default,
  validated per note, no-ops skipped. Built over the proven `setValueWhere`
  engine via new `previewValueWhere`/`applyValueToPaths` API methods (API 1.1).

- **Sticky modal titles** ([#47](https://github.com/mdelobelle/fileclass/issues/47)):
  every Fileclass modal now pins its heading to the top while the body scrolls,
  so you always know which modal you're in.
- **Sticky group headers in grouped pickers** ([#47](https://github.com/mdelobelle/fileclass/issues/47)):
  in a grouped candidate picker, the current group stays visible while you
  scroll — a pinned section header in the multi-select list, and a sticky bar
  naming the current group over the single-select suggester. The multi-select
  list also gets the sticky Save footer.

### Fields & typed input

- **Base-sourced candidates and values follow the base view's order**
  ([#47](https://github.com/mdelobelle/fileclass/issues/47)): `File`/`MultiFile`/
  `Media`/`MultiMedia` pickers and `Select`/`Multi` value lists sourced from a
  `.base` now list entries in the view's own order (its `sort:`, then `groupBy`
  flow) instead of an arbitrary vault order, so a long list is browsable and
  matches how the base reads. A `limit:` on the source view now applies too.
- **Grouped candidate pickers** ([#47](https://github.com/mdelobelle/fileclass/issues/47)):
  when the source view defines a `groupBy`, the `File`/`MultiFile`/`Media`/
  `MultiMedia` picker shows the same groups — headers in the single-select
  suggester (they keep delimiting the list as you type) and section headers in
  the multi-select list. The keyless group reads "(No value)".

### Views

- **Generated bases scope the fileClass filter to the managed view, not
  base-wide** ([#55](https://github.com/mdelobelle/fileclass/issues/55)): new
  `.base` files put the `fileClass == "X"` filter on the managed view (Bases'
  *"This view"*) instead of the whole base, so you can add a second view for
  another fileClass (e.g. a `bookAuthor` view in your `book` base) without it
  being shadowed. Migration-safe: existing bases keep their base-wide filter —
  nothing is rewritten silently — and sync/regenerate never pushes a per-view
  scope back to base-wide.

### Fixed

- **`contains` filter is now a case-insensitive substring match** (`ILIKE
  '%value%'`, [#56](https://github.com/mdelobelle/fileclass/issues/56)): across
  the list/bulk API, CLI `set-where`, and the bulk-edit UI, `contains` tests each
  value (and each element of a `MultiFile`/`MultiMedia` array) as a
  case-insensitive substring — so `activities contains comic` matches a stored
  `[[Comic]]` instead of requiring the exact, same-case wikilink.
- **Sync no longer silently no-ops on a base open in a tab**
  ([#55](https://github.com/mdelobelle/fileclass/issues/55)): a freshly created
  `.base` left open reads as empty on disk (Bases holds its layout in memory
  until the tab closes), so sync used to read stale content and do nothing while
  reporting success. Sync now detects the open tab and offers to close it (which
  flushes the layout) before mirroring, and initializes an empty/malformed base
  instead of no-op'ing.

## [0.1.0] - 2026-07-23

Seven new field types / options (from a triage of Metadata Menu's most-requested
types), consistent value previews, a user-editable color palette, and a base
column fix. All frontmatter-only, no new runtime dependency.

### UI

- **Sticky action footer in tall modals** ([#49](https://github.com/mdelobelle/fileclass/issues/49)):
  the primary button (Save / Add field) stays pinned to the bottom while the
  fields scroll, so it's always reachable — Add/edit field, fileClass options,
  the schema editor, and the Object/ObjectList editors.

- **User-editable custom color palette** ([#43](https://github.com/mdelobelle/fileclass/issues/43)):
  define your own colors in Settings → **Custom colors** (add via the native
  dialog, remove on hover). They appear in every `Color` picker after the
  standard palette — order: standard → your custom colors → the note's current
  value — and the picker's **+** pins a new color to the palette on the fly.
- **Custom colors in canvas field filters** ([#43](https://github.com/mdelobelle/fileclass/issues/43)):
  the color filters of `Canvas`/`CanvasGroup`/`CanvasGroupLink` fields are no
  longer limited to the 6 presets — they now show circular swatches for the
  presets, your saved custom colors, and the colors actually used in the
  referenced `.canvas`, plus a **+** for an arbitrary color.
- **Consistent field-type value previews** ([#44](https://github.com/mdelobelle/fileclass/issues/44)):
  a `Color` value now shows its swatch and an `Icon` value its glyph everywhere a
  value is displayed — the editable `fileclass-table` view, the native Properties
  editor, and the note-fields modal — via one shared helper. Display-only.

### Fixed

- **Base columns for fields whose name contains a space** ([#37](https://github.com/mdelobelle/fileclass/issues/37)):
  a field like `Test Property` was written to the generated base's `order:` as
  `note["Test Property"]`, which Bases re-prefixed to `note.note["Test Property"]`
  — an empty, non-editable column. The `order:` now uses the **bare property
  name** (`- "Test Property"`), which Bases normalizes to `note.Test Property`
  and renders/edits correctly. Existing bases self-heal on the next sync.

### Fields & typed input

- **`Color` field type** ([#33](https://github.com/mdelobelle/fileclass/issues/33)):
  stores a CSS color scalar, chosen from **palette swatches** (extensible **Color
  source** option, Obsidian Canvas palette by default) plus a **custom color**
  (native color input + any CSS value: hex/`rgb()`/name). Stores the raw CSS
  value for core Bases Map view marker interop. Native input + CSS, no dependency.
- **`Icon` field type** ([#32](https://github.com/mdelobelle/fileclass/issues/32)):
  stores an icon id chosen from a searchable **visual picker** (real previews via
  `getIconIds()`/`setIcon()`). An extensible **Icon source** option selects the
  bank — Lucide (default) or all registered icons. Stores the bare id (`map-pin`)
  for core Bases Map view marker interop. No dependency.
- **`Location` field type** ([#31](https://github.com/mdelobelle/fileclass/issues/31)):
  stores geographic coordinates as a `"lat,lon"` scalar (Bases Map view
  convention). Guided entry with range-validated latitude/longitude fields, a
  paste box, and an **Open in map** link (opens OpenStreetMap in the browser).
  No embedded map picker (no remote resources loaded in the plugin).
- **`template` option on `Input`** ([#27](https://github.com/mdelobelle/fileclass/issues/27)):
  compose an `Input` value from a fixed structure with `{{name}}` (free-text) and
  `{{name:["a","b"]}}` (dropdown) placeholders. Editing shows a guided form with
  one control per placeholder plus a live result preview; the stored value stays
  a single text scalar. Ports Metadata Menu's `options.template`.
- **`MultiInput` field type** ([#28](https://github.com/mdelobelle/fileclass/issues/28)):
  the list-valued counterpart of `Input` — stores a YAML list of text scalars and
  reuses the `template` option. A list editor adds/removes/reorders items, each
  entered through the same guided (or plain) input as `Input`. For capturing
  several values that share one shape (e.g. repository URLs).
- **`Duration` field type** ([#30](https://github.com/mdelobelle/fileclass/issues/30)):
  stores an RFC 5545 `DURATION` scalar (`P1W`, `PT1H30M`…). Editing lets you
  **type the value** in ISO (`PT1H30M`) or a human form (`1h 30m`, `2w`) with
  inline validation, or use weeks/days/hours/minutes/seconds spinners — the two
  stay in sync with a live compact preview. Zero runtime dependency; parsing and
  date math are done in-house.
- **`CycleDuration` field type** + **date "Set next date" action**: an ordered
  list of durations (an interval sequence). A `Date`/`DateTime` field can name a
  Duration/CycleDuration field via its **Next interval field** option; the date
  editor then gets a **Set next date** button that advances the date by the head
  interval and, for a CycleDuration, cycles the list to its next value (wrapping
  after the last) — one write. Covers spaced-repetition scheduling without a
  recurrence-rule engine (supersedes the dropped `Recurrence` proposal, #29).
- **Preset durations**: `Duration`/`CycleDuration` fields can define a list of
  preset durations in their schema, offered as quick picks at value entry (a
  one-click button for `Duration`, tap-to-append chips for `CycleDuration`).

## [0.0.4] - 2026-07-21

First public release installable on the stable Obsidian line (see
**Compatibility**). The successor to Metadata Menu, built on the core **Bases**
plugin, frontmatter-only, with no Dataview dependency.

### Schema

- fileClass notes (Metadata Menu's format, unchanged), inheritance (`extends`,
  `excludes`), binding by alias / tag / path / bookmark group / Base view /
  global default.
- Read-only resolver + index; `fileclass:indexed` event.
- **fileClass schema editor** — author options and field definitions from the UI.
- **Create a fileClass** command (creates the note and opens its schema editor).

### Fields & typed input

- Types: Input, Number (spinner), Boolean (toggle), Select, Cycle, Multi,
  Date/DateTime/Time (native picker + Today/Clear + link toggle + Natural
  Language Dates support), File/MultiFile, Media/MultiMedia (candidates from a
  Base view), Object/ObjectList (draft editor), JSON/YAML (parser-validated).
- **Canvas / CanvasGroup / CanvasGroupLink** — auto-maintained from a `.canvas`
  file's graph (edge/node/group color/side/label filters; "matching files" via a
  Base view). No Dataview.
- Object/ObjectList **display templates** (`{{field}}`, `{{date|FORMAT}}`, nested,
  ranked lists).
- `Lookup`/`Formula` are out of scope (use Bases views); their fields load and
  display read-only.

### UI surfaces

- Note-fields modal: compact rows, per-type icons, per-type quick actions
  (Boolean toggle, Cycle next), clickable links + indicators, and a fileClass
  inheritance breadcrumb footer that highlights a fileClass's fields on hover.
- Field indicators in tab header, file explorer, bookmarks, backlinks, Bases
  first column, and after internal links (reading view + Live Preview).
- **Edit buttons in the native Properties editor** (per-field type icon → typed
  input).
- Context menus for notes and fileClass notes.

### Data quality

- **Required fields** — a per-field `required` flag (schema editor toggle); an
  empty required field is a violation.
- **Validation columns** in the `fileclass-table` view — a `valid` ✓/✗ column and
  an `errors` column showing which notes violate their schema (toggle in
  Settings, on by default).
- Consistent validation everywhere: the table columns, the `validate` API/CLI
  command, and every write (`setValue` / `set-where`) share one engine.

### Views (Bases)

- Generate a `.base` for a fileClass; one-way explicit sync with a status button.
- Editable **`fileclass-table`** Bases view (in-cell typed editing).
- Open / Modify a fileClass's base (command + context menu).

### Terminal (API, CLI & TUI)

- **Public plugin API** (v1.0) on `plugin.api` — JSON-serializable inspect /
  validate / mutate surface (`listFileClasses`, `getSchema`, `explain`,
  `listNotes`, `validate`, `setValue`, `clearValue`, `insertMissing`,
  `setValueWhere`, …), reachable via `obsidian eval`.
- **`fileclass` CLI** — terminal access driving the running app: `fileclasses`,
  `schema`, `explain`, `list`, `get`, `set`, `validate` (CI-friendly exit code),
  and dry-run-by-default `set-where` bulk edits; `--json` on any command.
- **Interactive TUI** (ink) — home menu, browse fileClasses → notes → fields,
  typed editing (choice + File-candidate pickers), inline validation status, and
  vault switching.
- **Vault targeting** — `--vault` / `FILECLASS_VAULT` / `fileclass use` default /
  active vault, in that precedence.

### Quality

- 186 unit tests; TypeScript strict; private Obsidian/Bases internals isolated
  behind a single adapter and best-effort DOM boundaries.

### Fixed

- **Select/Cycle/Multi "From a note" source** now resolves the note path
  tolerantly (exact path, then linkpath), so a `valuesListNotePath` without the
  `.md` extension still finds the note and returns its values instead of a blank
  list. The field-options "Note path" input also gained a note autocomplete, so
  the path is picked rather than typed by hand (#20).

### Compatibility

- Lowered `minAppVersion` to **1.12.7** (was 1.13.2). The plugin loads and the
  schema/typed-input layer works without Bases; Bases-backed features degrade
  gracefully when the core Bases internals differ or are absent, rather than
  erroring. Full parity of Bases-backed features on 1.12.7 should be verified on
  a real install before release.
