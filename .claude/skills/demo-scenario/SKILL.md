---
name: demo-scenario
description: Author a Fileclass demo/screencast scenario — a numbered demo/NNN_*/ folder with a scenario.yaml narration script and a demo-vault/ fixture, played by demo/record.mjs while the operator performs the demo on camera. Use whenever the ask is to create, extend or fix a demo, a screencast, a scenario, a narration/subtitle script, or a demo vault ("crée moi un scénario pour présenter <feature>").
---

# Fileclass demo scenarios

**Read `demo/SCENARIO.md` first and follow it** — it is the spec (yaml schema,
subtitle craft, pause conventions, fixture rules, verification). This file only
says what to do at a glance.

The model: the operator performs every click and keystroke on camera; the tooling
only shows a subtitle at the bottom of Obsidian and advances when the operator
presses ⌘⌃⌥⇧C. So a scenario is *words + a starting vault*, nothing scripted.

Two standing rules, before anything else:

- **Propose the numbered steps in the chat and wait for confirmation** — never
  write the files first. *"modifie l'étape X"* → re-propose from step X onwards
  (earlier steps stay); *"reprends le scénario NNN à l'étape X"* → same, on an
  existing scenario.
- **The universe is always a media library** (unless told otherwise): books,
  comics/BD, albums, articles, artists, authors, activities, using real
  widely-known works and people (*Dune*, *Tintin*, *Kind of Blue*, Miles Davis).
  Neutral, instantly legible, no `John Doe`/`Note 1` placeholders. Keep the same
  works across takes so the series reads as one vault growing.

Procedure:

1. **Check the feature in the source** before writing subtitles — command names in
   `main.ts`, setting labels in `src/settings/settingsTab.ts`, modal wording in
   `src/ui/*.ts`, and what each command actually writes. Never guess UI strings.
2. **Create `demo/NNN_verb_object/`** — take the number and the scope from
   `demo/ROADMAP.md` (the planned series) rather than inventing them, and reuse
   its media-library cast; each take starts where the previous one ended.
3. **Write `scenario.yaml`** — `title`, `description`, `vault_name`, `plugin`,
   optional `settings`, `initial_pause`, `default_pause`, then `steps:` with a
   `title` (the subtitle) and a `pause` (the beat *after* the operator's cue).
   **Every subtitle must be sayable out loud, verbatim, by a narrator** — no
   arrows or UI paths (`Open the Fileclass settings`, never `Settings →
   Fileclass`). One idea per step, ≤ ~70 chars, say why not just where, emoji only
   on the closing line.
4. **Build `demo-vault/`** — the smallest vault that makes the story possible.
   Notes/folders/bases only: never commit the built plugin or its `data.json`
   (use `plugin: true` + `settings:`); `.gitkeep` for folders that must exist;
   `.obsidian/workspace.json` when the take must open on a given note.
5. **Verify with `node record.mjs NNN --dry`**, re-read the printed script as a
   viewer, confirm the fixture matches step 1, then hand it over.

Never rewrite `demo/lib/*` or `record.mjs` to script the interaction: driving
Obsidian is what the previous generation of this tooling did (`demo/legacy/`) and
it looked robotic on camera. That's the whole reason this format exists.
