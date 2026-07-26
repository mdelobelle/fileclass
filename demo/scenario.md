# Onboarding video — storyboard

Target length ~2–3 min. Voice-over/subtitles can be added in post, but the
on-screen captions (`d.step(...)`) already tell the story.

## The story arc

**Act 1 — set the stage** (`step1`)
| On screen | Caption |
|-----------|---------|
| Fileclass is installed (pre-staged) | "Fileclass turns plain notes into typed, structured data — no code" |
| Create the `Classes/` folder | "First, a home for your classes — the Classes/ folder" |
| Set `classFilesPath` in settings | "Tell Fileclass where they live, and you're set up" |

**Act 2 — define a type, then create real notes** (`step2`)
| On screen | Caption |
|-----------|---------|
| Palette → Create a class → **Author** | "Every structure starts with a type. Let's define an Author" |
| Add a **Date** field `birthdate` | "An author has a birthday — give it a typed Date field" |
| Add a **Select** field `country` (values) | "…and a home country — a Select with a fixed set of values" |
| Author **Frank Herbert** — via the command palette | "Our first author — we'll tag Frank from the command palette" |
| Author **Arnaldur Indriðason** — via the right-click menu | "A second author — Arnaldur, this time from the right-click menu" |
| Fill each note's fields (guided, typed inputs) | "Now give … some values — guided, typed inputs" |
| — | "Two authors, fully typed — and we never wrote a line of code" |

**Act 3 — see it, edit it, connect it** (`step3`, builds on step 2)
| On screen | Caption |
|-----------|---------|
| Right-click the Author fileClass → create its base | "Structure you can see — turn the class into a Bases table" |
| The generated table opens | "Your authors as a live table — one row per note" |
| Edit Frank's country **in a table cell** | "And it's editable — change a value right in the table" |
| Palette → Create a class → **Book** | "Classes can link to each other. Let's add a Book" |
| Add an **author** field, type **File**, source = the Author base | "Its choices come straight from the Author table" |
| New note **Dune**: add Book, insert fields | "A new book joins the library: Dune" |
| Pick the author from the table's candidates | "Now link its author — the choices are your Author notes" |
| — | "Dune, by Frank Herbert — a typed, linked library, all in frontmatter" |

## How the driver works (manual-click model)
The driver **never clicks** — it types text, sets `<select>`/date values, opens
the palette, and watches the DOM. **Every mouse click is yours**, so you control
the pointer's timing: when the caption turns **purple and ends with `…`**, do
the named click (a button, a pencil ✎, a palette row, a right-click menu item, a
list option). The driver detects the result and resumes on its own.

Two reasons clicks are handed off:
- The file **right-click menu** renders in a separate window the debug port
  can't reach — it could never be driven anyway.
- Manual clicks look natural on camera and let you pace the mouse.

There's **no fake cursor** in the run — add a visible pointer in post if you want
one.

## Seeded vs shown live
- **Seeded** (`seed.mjs`): only the plugin (installed + enabled). Nothing else —
  the `Classes/` folder, the `classFilesPath` setting, and every fileClass and
  note are created **on camera**.
- **Shown live** (`record.mjs`): the whole arc above.

## Running / tuning
- `node record.mjs` runs everything; `node record.mjs 1|2|3` runs one act (step 3
  needs step 2's artifacts — run it at least once first).
- Each step is idempotent: it deletes its own artifacts up front, so re-runs
  start clean.
- Pace: adjust the `beat(...)` pauses (a small helper at the top of `record.mjs`).
- Detectors key off the DOM (modal counts, placeholders, frontmatter) — robust
  across themes; if a future Obsidian version renames things, adjust the
  predicates in `record.mjs`.
