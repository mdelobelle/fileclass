# Fileclass demo tooling

Numbered demo scenarios for screencasts. Each one stages a throw-away vault,
opens it in Obsidian, and shows subtitles at the bottom of the screen while
**you** perform the demo — the script never clicks or types. You cue the next
subtitle with a keyboard chord, so the pacing is yours and the pointer moves like
a human's.

```
demo/
  record.mjs                        # node record.mjs 001      — run a take
  voiceover.mjs                     # node voiceover.mjs 001   — hear / build the narration
  smoke.mjs                         # node smoke.mjs 001      — check a script against the app
  publish.mjs                       # node publish.mjs 001 …   — package + upload
  sync-docs.mjs                     # node sync-docs.mjs       — videos back into the docs
  lib/                              # scenarios, vault staging, subtitles, voice, YouTube
  001_install_and_param_fileclass/  # scenario.yaml + demo-vault/
  002_create_your_first_fileclass/
  ROADMAP.md                        # the planned series + its recurring cast
  SCENARIO.md                       # how to author a new scenario
  PUBLISHING.md                     # YouTube setup + release pipeline
  legacy/                           # previous generation (scripted CDP driver)
```

## Setup (once)

```bash
npm run build          # in the plugin repo root — fixtures install this build
cd demo && npm install # puppeteer-core
```

## Record a take

```bash
node record.mjs 001        # from demo/ — or `node demo/record.mjs 001` from the repo root
```

1. It asks to quit your Obsidian, then stages
   `~/fileclass-demos/<scenario>/<vault>` from the scenario's `demo-vault/`
   fixture — installing the freshly built plugin when the scenario starts with it,
   and always in **dark mode with the Minimal theme** whatever your system uses.
2. It relaunches Obsidian on that vault with `--remote-debugging-port=9222`, then
   waits for the cue: start QuickTime (File → New Screen Recording), size the
   window, and press **⌘⌃⌥⇧C** when you're rolling. Nothing is on a timer, so the
   take begins exactly when you're ready.
3. After `initial_pause` (a blank beat, or the title card), subtitle #1 appears. Do
   the action, then press **⌘⌃⌥⇧C** again — the subtitle fades out, the step's
   `pause` elapses, the next one fades in. (Enter in the terminal also advances;
   `q` or Ctrl-C aborts.) The caption lives on whichever window has focus, so
   opening settings moves it rather than duplicating it.
4. After the last step it quits Obsidian, restores your vault list, and wipes the
   demo vault — so the next take starts from exactly the same state.

Flags: `--dry` (print the script, run nothing), `--attach` (narrate over the
Obsidian you already have open, no staging), `--keep` (leave the vault as you left
it), `--title-card` (show the title full-screen during the intro), `--speak`
(hear each line as it appears, to rehearse the pacing), `--voice`, `--rate`,
`--port`, `--yes` (don't ask before quitting Obsidian).

Every take journals when each subtitle appeared, in
`~/fileclass-demos/takes/<scenario>-<stamp>.json` — that's what the voice-over
uses.

## Smoke-test a scenario before recording

```bash
node smoke.mjs 007          # stage, launch, report, and stay open
node smoke.mjs 007 --close  # just the report
```

Stages the take's vault, opens it in a real Obsidian and reports what the script
promises against what the app exposes: the plugin version and indexed classes, each
note as the take will find it (class, frontmatter keys, fields not yet inserted),
and — per step — the commands, settings and field types it names. A step that says to
*run* something without naming a known command, or to *set* something in the settings
without naming one, is flagged. Obsidian stays open so the critical gestures can be
tried by hand before you hit Record.

## Voice-over

The subtitles *are* the narration script, so the audio is generated from them and
can't drift from what's on screen.

```bash
node voiceover.mjs 002 --preview                   # hear the script before recording
node voiceover.mjs 002                             # track timed on the last take
node voiceover.mjs 002 --video take.mov --sync 4.2 # …and mux it onto the capture
node voiceover.mjs --voices                        # what `say` can use (→ = default)
```

`--sync` is the timecode, in your capture, at which the **first subtitle** appears:
the take's clock starts on your cue chord and the capture starts whenever you
armed QuickTime, so that single number ties the two together. Scrub to the first
subtitle, read the timecode, pass it. Without it the track starts at the cue.

It renders one file per line with macOS `say`, lays each at the offset its
subtitle had in the take, and mixes a single `voiceover.m4a` (per-line files and a
`manifest.json` of offsets stay next to it, for hand-placing in an NLE). Reword a
line and re-run — the capture is untouched. `--preview` needs no take: it chains
the lines with their scenario pauses, which is also how you find out the take will
run 60 seconds before shooting it.

The default voice is **Zoe (Enhanced)** (`PREFERRED_VOICES` in `lib/voice.mjs`,
overridable with `--voice`); more can be downloaded in System Settings →
Accessibility → Spoken Content → Manage Voices.

Identifiers are respelled for the ear only — `fileClass` is spoken "file class",
`.md` "dot M D" — through the table in `lib/voice.mjs`, plus a per-scenario
`pronounce:` map in the yaml for terms only that take shows. The subtitle on
screen always keeps the exact identifier.

Live `--speak` is for rehearsal only: QuickTime records the mic, not the system
output, so live speech reaches the capture only through a virtual audio device
(BlackHole and friends).

The Minimal theme is copied from a vault that already has it (or from
`$FILECLASS_DEMO_THEME`) — point that variable at a fresh download if the local
copy is behind. Trim and add voice-over afterwards in any editor; the subtitles
are burned into the capture.

## Publish

```bash
node publish.mjs 002 --video ~/Movies/002.mov --sync 4.2 --upload
```

Builds a release folder (video muxed with the narration, `captions.en.srt`, title,
description, `youtube.json`), then uploads it, attaches the caption track and adds
the video to the series playlist. Titles come out as `Fileclass #002 · Your first
class`, and the description links the feature's doc page and the playlist.

After a successful upload it feeds the published videos back into the docs:
`docs/data/videos.json`, the generated `docs/content/videos.md` index, and the
roadmap's Status column. In the prose, `{{< video "002" >}}` renders a link card
(and `{{< video-embed "001" >}}` a player) wherever you paste it once.

Setup and caveats — including what to do when an upload seems to fail — are in
**[PUBLISHING.md](PUBLISHING.md)**.

## Write a new scenario

See **[SCENARIO.md](SCENARIO.md)** — yaml schema, subtitle conventions, pause
timings, and what belongs in a fixture. In Claude Code, the `demo-scenario` skill
follows it.
