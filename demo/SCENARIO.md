# Authoring a demo scenario

What to do when the ask is *"crée moi un scénario pour présenter `<feature>`"*.

A scenario is a **narration script + a starting vault**. Nothing in it drives
Obsidian: the operator performs every click and keystroke on camera at human
speed, and the only thing the tooling does is put the right subtitle on screen at
the right moment (and put the vault back afterwards). So the deliverable is two
things: words that read like a story, and fixtures that make the story possible.

```
demo/
  NNN_short_snake_case/
    scenario.yaml     # the narration
    demo-vault/       # the vault as it must look when recording starts
```

## 0. Two standing rules

**Propose the steps before writing anything.** Present the numbered list of
subtitles (with pauses) in the chat and ask for confirmation. Then:

- *"modifie l'étape X"* → re-propose the scenario **from step X onwards** (steps
  1…X-1 stay as agreed), and ask again.
- *"reprends le scénario NNN à l'étape X"* → same thing on an existing scenario:
  keep its steps 1…X-1, re-propose from X.

Only write `scenario.yaml` + the fixture once the list is confirmed.

**The demo universe is always a media library** (unless told otherwise):
books, comics/BD, albums, articles, artists, authors, activities. Use real,
widely-known works and people — *Dune*, *Tintin*, *Kind of Blue*, Frank Herbert,
Miles Davis. Two reasons: the domain is neutral and instantly legible (everyone
understands "a book has an author and a publication date"), and real titles avoid
both placeholder mush (`John Doe`, `Note 1`, `Field A`) and the awkwardness of
inventing a cast. Reuse the same works across takes so the series feels like one
vault growing — a class added in `002` is the one queried in `005`.

## 1. Get the feature right before writing a word

The subtitles name real UI. Check the source instead of guessing:

- command names → `main.ts` (`registerCommands`), shown in the palette as
  `Fileclass: <name>`;
- setting labels → `src/settings/settingsTab.ts` (`setName(...)`);
- modal titles/buttons → `src/ui/*.ts`;
- what a step actually produces → the command's implementation (e.g. adding a
  class writes only the `fileClass` property; the fields arrive with *Insert
  missing fields*).
- feature background → `.claude/docs/ARCHITECTURE.md`, `docs/`, `CHANGELOG.md`.

A subtitle that promises something the UI doesn't do wastes a take.

## 2. Number and name the take

`NNN_verb_object`, three digits, zero-padded, snake_case:
`001_install_and_param_fileclass`, `002_create_your_first_fileclass`. Numbers are
the running order of the series, and **each take starts where the previous one
ended** — that continuity is what the fixture encodes.

A take may take a **letter suffix** — `016b_` — when it belongs *beside* another
rather than at the end of the series: a facet of the same feature, found after the
numbers were handed out. It sorts between 016 and 017 everywhere (the series list,
the video data, the roadmap), and its YouTube title reads `Fileclass #016b`.

[ROADMAP.md](ROADMAP.md) holds the planned series, its number for each feature,
and the recurring cast of the media library. Take the number from there rather
than inventing one, and use the same works and people — a class introduced in one
take is the one queried three takes later.

## 2b. Tours are a different genre

`000_tour_first_look` is the catalogue's entry point and the one take that breaks the
60-second budget on purpose: ~270 words, ~5 minutes, store install included. It ends by
pointing at the numbered series and the docs, so it never has to cover everything — one
type gets the spotlight (`File`, whose candidate list narrows itself) and the rest are
named and left to their own takes.

A tour starts from **nothing**: no class folder, no class, `plugin: false`, no
`settings:` block — pre-filling the class folder would delete its first act. Two
consequences to carry into any future tour:

- the **store** version must already contain what the tour shows, since the install is
  performed on camera. Tour #1 demonstrates the dependency builder (#19), so it can only
  be recorded once the release carrying it is live: **release first, then record**;
- a class bound by folder (`Files paths`) never writes `fileClass:` into its notes, so a
  base filtering on `fileClass == "…"` sees none of them. Scope such a base **by folder**.
  That one was caught by rehearsal, not by reading.

## 3. Write `scenario.yaml`

```yaml
title: "Fileclass — your first class"          # shown in the terminal, and as a
                                              #   title card with --title-card
description: "One line: what the viewer learns."
vault_name: "Demo"                            # folder name = vault name on screen
plugin: true                                  # false = installed on camera
settings:                                     # plugin data.json (needs plugin: true)
  classFilesPath: "Classes/"
  fileClassAlias: "fileClass"
pronounce:                                    # spoken form of on-screen strings
  Classes/Book.md: "Book dot M D inside the Classes folder"
initial_pause: 1500                            # blank beat AFTER the starting cue,
                                              #   before subtitle #1
default_pause: 900                             # used by steps without `pause`

steps:
  - title: "Add a field: birthdate"
  - title: "Its type is Date — not a string that looks like one"
    pause: 1200
  - title: "Save. The class is a note whose frontmatter lists typed fields"
    pause: 1800
    hold: true                                 # keep this caption during the pause
```

Keys are forgiving: `initial pause` works as well as `initial_pause`, a step may
be a bare line (`- Save the schema`), and durations accept `1500`, `"1.5s"` or
`"800ms"`. Quote any title containing a colon. Unknown keys are an error, on
purpose — a typo'd key must not silently do nothing.

**`doc:` must resolve.** Its value becomes the *Docs:* line of the published YouTube
description, so a wrong page leaves the site through a channel nobody re-reads — take 023
went out pointing at `schema/#required-fields` when the section lives in `fields.md`.
`smoke.mjs` now prints a **Docs link** line and names the page that does hold the anchor,
computing the slug the way Hugo does (checked against all 101 headings of the docs, no
mismatch). Check it before recording, not after uploading.

**How a take is clocked:** the operator arms the screen recorder and cues once to
start — nothing runs on a timer before that. `initial_pause` is the blank beat
between that starting cue and subtitle #1.

**How `pause` is spent:** subtitle N shows → the operator acts → cue chord →
subtitle N fades out → `pause` of step N elapses on a clean screen → subtitle N+1
fades in. So `pause` is the *breathing room after* a step, and the last step's
pause is the beat before teardown. `hold: true` keeps the caption up during that
beat, for the two or three moments where the words should sit on the result.

## 4. Make the subtitles read like a narrative

- **Every line must be sayable out loud.** It's a script, not a breadcrumb trail:
  a voice-over should be able to read it verbatim. So no arrows, no UI paths, no
  symbols a narrator would have to translate — `Open the Fileclass settings`, not
  `Settings → Fileclass`; `Right-click the note and pick Add a class`, not
  `Right-click → Fileclass → Add a class`. Say the action as a sentence, and let
  the video show the path.
- One idea per step, one action per step. If a step needs "and", split it.
- Aim for ≤ 70 characters — it's a subtitle, not a paragraph. Long ones wrap and
  cover the UI.
- Say *why*, not just *where*: "Its type is Date — not a string that looks like
  one" teaches; "Select Date in the dropdown" dictates.
- Curly quotes around literal UI labels: `Point “Class files folder” at Classes`.
- Identifiers stay exact **on screen** and get fixed **for the ear**: `fileClass`,
  `Fileclass`, `.md`, `frontmatter` are already in the shared table in
  `lib/voice.mjs` (`fileClass` → "file class"). A term only this take shows —
  a path, a file name — goes in its own `pronounce:` map. Never dumb down the
  subtitle to help the voice.
- Present tense, no "we will", no "in this video".
- Ellipses to carry one sentence across two steps (`Open the community store…` /
  `…and search for Fileclass`) — that's how a series of clicks reads as prose.
- Open with the problem, close with the payoff, and let the last step be the only
  one with an emoji (🎉).

Pause conventions that have felt right on camera:

| Moment                              | pause       |
| ----------------------------------- | ----------- |
| plain click in a sequence           | 700–900     |
| step whose result must be read      | 1200–1600   |
| reveal ("the fields appear, typed") | 1600–1800   |
| closing line                        | 2000–2200   |

### Budget: 60 seconds of narration, plus the typing tax

Don't count steps, count **spoken seconds** — aim for **55 to 60** — then count how
many steps ask the operator to **type**.

| take | narration | finished video | ratio | typing steps |
| ---- | --------- | -------------- | ----- | ------------ |
| 001  | 60.6 s    | 1:51           | ×1.83 | 1 |
| 002  | 59.9 s    | 2:12           | ×2.20 | 2 |
| 003  | 68.4 s    | 1:52           | ×1.64 | 2 |
| 004  | 63.8 s    | 2:07           | ×1.99 | 3 |
| 005  | 50.1 s    | 1:43           | ×2.06 | 1 |
| 006  | 58.3 s    | 1:41           | ×1.73 | 1 |
| 007  | 60.8 s    | 2:54           | ×2.86 | 5 |
| 008  | 60.3 s    | 2:17           | ×2.27 | 3 |
| 009  | 52.7 s    | 1:38           | ×1.86 | 3 |
| 010  | 49.5 s    | 1:42           | ×2.07 | 3 |

Click-driven takes land between ×1.6 and ×2.3 of their narration; take 007 respected
the narration budget to the second and still ran a minute longer, because it was the
first take **dominated by typing** — a format, a wrong format, three settings. Roughly,
a step that types costs **4–6 s of video** beyond its narration; a step that clicks
costs 1–2 s.

What the count doesn't capture is *what* gets typed: 009 has three typing steps too,
but they're a class name, a field name and `45m 44s` — short strings, ×1.86 — where
007's were moment formats read character by character. Count typing steps, then look
at what they spell.

So use both numbers:

- **narration** 55–60 s, checked with `node voiceover.mjs NNN --preview`;
- **typing steps**: two or three is comfortable. Five means a ~3-minute video.

Three minutes is fine when every step teaches something — a viewer who finds it slow
plays it at 1.5×. What is *not* fine is padding: a step that shows nothing new costs
the same seconds and teaches nothing. So when a take needs five typing steps, first
ask whether it is really one feature (007 could have been two: the picker, then the
formats). If it is one, let it run long rather than cutting the part that explains
why.

Over budget with every step earning its place? Shorten the **words**: the
`pronounce:` map exists so a subtitle can keep `1965-08-01` on screen while the voice
says "ISO". Or merge two steps into one idea. Never shave the pauses — those are what
make a take readable.

A few things are pronounced for you, in `lib/voice.mjs`: identifiers (`fileClass` →
"file class"), `id` as two letters, `lat, lon` in full — and a **take number written
`016` is read "sixteen"**, since `say` otherwise spells the padded form out digit by
digit. Versions and dates are left alone.

## 5. Build `demo-vault/` — the smallest vault that makes the story possible

- **Open the vault where the take starts.** Set `.obsidian/workspace.json` so the first
  frame already shows the most relevant thing: the note the take works on, or the base view
  it is about. A take that opens on last take's note spends its first seconds navigating,
  and navigation is the one thing no viewer needs to watch. A leaf on a base reads
  `{"type":"bases","state":{"file":"Books.base","viewName":"No author yet"}}` — measured, and
  the `viewName` matters: without it the base opens on its first view.
- **Only show what earlier takes have introduced.** The series is cumulative, so a surface
  that has its own take later must not carry a step here — `fileclass-table` and its
  validation columns belong to arc 7, so take 023 makes its point with a plain Bases view and
  a filter instead. An incidental appearance on screen is fine; a step built on it is not.

- Only what the viewer sees: notes, folders, `.base` files. Two or three notes is
  usually plenty, and their content should be prose that *wants* structure (the
  same facts buried in text, so typing them is visibly a win).
- Media-library material, continuous with the earlier takes: the notes are books,
  albums, comics, articles, artists, authors or activities the audience knows.
- **Never** commit `main.js`, `manifest.json`, `styles.css` or a plugin
  `data.json` into a fixture: set `plugin: true` and `settings:` instead, and
  `record.mjs` installs the freshly built plugin at staging time. A stale plugin
  copy in git is a wrong demo waiting to happen.
- `.obsidian/appearance.json`, `core-plugins.json`, `app.json` are written with
  video-friendly defaults unless the fixture ships its own: **light mode
  (`moonstone`) + the Minimal theme**, 18px base font, Bases enabled. Every take
  records light whatever the operator's system appearance is; the theme is copied
  from `~/Obsidian-Dev/.obsidian/themes/Minimal` (or `$FILECLASS_DEMO_THEME`), so
  no third-party CSS is committed here. Only override it in a fixture if the
  feature being shown *is* about appearance.
- Empty folder the story needs (e.g. `Classes/`)? Add a `.gitkeep` — Obsidian
  hides dotfiles, so it stays invisible on camera.
- Add `.obsidian/workspace.json` when the take must start on a specific note or
  with a specific sidebar state; every take then opens identically.
- The fixture is pristine and read-only: `record.mjs` copies it to
  `~/fileclass-demos/<scenario>/<vault_name>` and wipes that copy after the take,
  so a botched run costs nothing.

## Poking at a staged vault (`probe.mjs`)

To check something against the real app — a picker's contents, what a gesture
writes, a computed style — put it in a throwaway module and let `probe.mjs` own the
lifecycle:

```bash
node probe.mjs 014 /tmp/check-thumbnails.mjs        # stage, run, put everything back
node probe.mjs 014 /tmp/check.mjs --keep            # leave it open to look at it
```

```js
export default async function ({ stage, page, vault, sleep }) {
	console.log(await page.evaluate(() => window.app.vault.getName()));
}
```

It stages the fixture, launches Obsidian, **waits until the plugin is actually
loaded** (about 1.3s — no fixed sleep), runs the module, and tears down in a
`finally`: quit, vault list restored, staged vault wiped. Same on a throw, and on
SIGINT — all three verified, because the habit it replaces (backgrounding
`smoke.mjs` behind a `sleep 300` pipe) left Obsidian open on a staged vault
whenever the probe finished early or died, and someone had to quit it by hand.

The vault list is also backed up **on disk** now, so a run killed hard enough to
skip its own teardown can still be undone — `restoreVaultRegistryFromDisk()` in
`lib/stage.mjs`.

## 6. Verify before handing it over

```bash
node record.mjs NNN --dry        # parses the yaml, prints the script + pauses
node voiceover.mjs NNN --preview # renders the narration: hear it, and get its length
node smoke.mjs NNN               # opens the staged vault and checks the script against it
```

Then re-read the printed script as a viewer: does it tell one story? Is the
narration inside its 60-second budget, and how many steps ask for typing? The
preview is the honest test of the "sayable out loud" rule too — a line that sounds
wrong spoken *is* wrong.

**`smoke.mjs` answers the question you can't answer by reading**: does the UI still
match the words? It stages the vault, opens it in a real Obsidian, and reports

- the plugin version, whether Bases is available, the classes indexed;
- each note as the take will find it — its class, its frontmatter keys, and which
  declared fields are not inserted yet (a fixture typo shows up here);
- for every step, the **commands, settings and field types it names** that the app
  actually exposes — and a warning when a step says to *run* something without
  naming a known command, or to *set* something in the settings without naming a
  setting of that pane.

That last check is the one that earns its keep: a subtitle naming a command whose
name has drifted reads fine on paper and fails on camera. Take 003 was recorded
against an input that silently refused what its own script asked the viewer to type.

Obsidian stays open on the staged vault afterwards, so the two or three gestures the
take depends on can be tried by hand before Record. Only after that, tell the
operator it's ready to record.

## Running a take (operator's side)

```bash
node record.mjs 002              # stage, launch, narrate, reset
node record.mjs 002 --dry        # print the script only
node record.mjs 002 --attach     # narrate over the Obsidian already open
node record.mjs 002 --keep       # don't reset the vault at the end
node record.mjs 002 --title-card # show the title full-screen during the intro
node record.mjs 002 --no-keys    # hide the pressed-keys badge
```

It quits your Obsidian (asks first), stages the vault, relaunches Obsidian on it
with `--remote-debugging-port=9222`, and waits for Enter so you can start
QuickTime. With `--speak` it says **"ready"** just before waiting: an audible
"armed" without looking away from Obsidian, and it pays the voice's one-time
startup off-camera — measured at about a second, which the first subtitle used to
absorb. A cue pressed during that word still counts. Then **⌘⌃⌥⇧C in Obsidian** advances the narration (Enter in the
terminal also works; `q` or Ctrl-C aborts and cleans up). At the end it quits
Obsidian, restores your vault list and wipes the demo vault.

If a caption covers what the step is about — a setting low in a pane, the controls of a picker — **⌘⌃⌥⇧U** lifts it to the top of the screen, and the key badge with it. Press it again to drop it back; the next subtitle starts at the bottom either way, so a raised caption never leaks into the following step.

A step may also carry values, shown in the caption and spoken nowhere — the narration reads the step's title, not eighteen digits. Two kinds, told apart by colour:

- **`input:`** — what the operator would otherwise type on camera: coordinates, a link, a long id. Shown in **yellow**, and **⌘⌃⌥⇧I** types it into whatever field is focused: real keystrokes, so the field's own handlers run and the viewer sees the text appear. Several values in one step are written `input: "Attic | B | 1"` and served **one per press**, struck through in the caption as they go — a step that fills three boxes must not dump all three into the first one. ` | ` is the separator precisely because a single value may hold a comma and a space.
- **`values:`** — short words the operator types by hand. Shown in **blue**, so it is obvious at a glance that no chord will insert them and there is nothing to wait for. Same ` | ` list. Use these when a take fills more boxes than the cue is worth: pressing a chord eleven times has its own rhythm cost.

**Keys you press show up on screen.** A badge under the caption names the special
keys as they happen — `⏎`, `⌥⏎`, `⇥`, `⎋`, and `⏎ ×3` when you chain the same one —
so a keyboard gesture is legible in the recording. What it deliberately never
shows: the text you type (the viewer reads the value in the field), and the cue
chord (pressing it clears the badge instead). A modifier held on its own appears
after a beat, which is how an Alt-click reveal reads on camera. `--no-keys` turns
the whole thing off.

Because the badge names the key, a subtitle shouldn't: write what the gesture
*means* ("save it", "one click sets the next date"), not which key you hit.

Gotchas worth knowing:

- Obsidian may ask to trust the vault / turn off Restricted mode the first time
  it opens a staged vault. In `001` that prompt is part of the story; elsewhere,
  accept it before cueing step 1. `record.mjs`, `smoke.mjs` and `probe.mjs` accept
  it for you (`lib/trust.mjs`) — the plugin does not load until it is answered.
  Accepting it sometimes leaves **Settings → Community plugins** showing, in its own
  window in this build; the tooling tries to close it and does not always win, so
  glance at the screen before cueing step 1.
- A staged vault ships with **Always update links** and no delete prompt, so a
  rename or a delete on camera doesn't raise a dialog you'd have to dismiss mid-take
  (`lib/stage.mjs`, `app.json` defaults). A fixture that wants the prompt can commit
  its own `.obsidian/app.json` — the defaults only fill in what a fixture omits.
- The file right-click menu opens in its own window — fine here, since you're the
  one clicking, and the subtitle stays visible in every window.
- With `--keep`, Obsidian stays open on the demo vault, so *it* will mark that
  vault as the last-opened one when you eventually quit it.
- `demo/legacy/` holds the previous generation of this tooling (a CDP driver that
  typed and detected DOM changes). Kept for reference; not part of this flow.
