# Onboarding video — storyboard

Target length ~60–90 s. Voice-over/subtitles added in post.

| # | On screen | Driven by | Caption |
|---|-----------|-----------|---------|
| 0 | Open `Dune` (a plain note) | `openLinkText` | "A plain note — no schema yet" |
| 1 | Add class → pick **Book** | `add-class-to-note` + type "Book" | "Give it a type: the Book fileClass" |
| 2 | Fields appear in Properties | `insert-missing-fields-in-current-file` | "Insert the fileClass fields" |
| 3 | Note-fields modal opens | `manage-note-fields` | "Fill values with guided, typed inputs" |
| 3a | **status** → dropdown (constrained) | pencil on status row | — |
| 3b | **cover** → Color picker (circles) | pencil on cover row | — |
| 3c | **icon** → Icon grid (search "book") | pencil on icon row | — |
| 4 | Generate + open the Bases table | `create-base` → `open-base` | "Generate a Bases table for this fileClass" |
| 5 | Table with swatch/glyph previews | — | "Typed, validated, frontmatter-only — try Fileclass" |

## What's seeded vs shown live
- **Seeded** (`seed.mjs`): the plugin (installed + enabled), `classFilesPath = Classes/`, a ready **Book** fileClass (status/rating/cover/icon/read), and three plain book notes in `Library/`.
- **Shown live** (`record.mjs`): binding a note, inserting fields, filling values via the pretty pickers, and the generated table — the payoff, with the least fragile clicking.

## Notes for tuning
- The modal steps (3a–3c) click by row name / element index — adjust `nth`/text if your theme or Obsidian version shifts the DOM.
- Increase the `beat()` pauses for a calmer pace; the fake cursor eases between points.
- For a "build the schema live" variant, add steps around `edit-class-schema` before step 2 (more clicks, more fragile).
