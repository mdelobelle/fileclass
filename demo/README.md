# Fileclass onboarding-video tooling

Full-auto: seed a demo vault, drive Obsidian over CDP, record the screen.
Self-contained (its own `package.json`); not part of the plugin build.

## Prerequisites

- The plugin built once (from the repo root): `npm run build`.
- `ffmpeg` (for recording): `brew install ffmpeg`.
- Deps here: `cd demo && npm install`.

## 1. Seed a demo vault

```bash
node seed.mjs --vault ./demo-vault
```

Creates a fresh vault with the plugin installed + enabled, `classFilesPath =
Classes/`, a ready **Book** fileClass, and a few plain notes in `Library/`.

## 2. Launch Obsidian on it with remote debugging

```bash
open -na Obsidian --args --remote-debugging-port=9222 \
  "obsidian://open?path=$(pwd)/demo-vault"
```

Then, once open: make sure the core **Bases** plugin is enabled, size the window
for the recording, and (optional) bump zoom with `Cmd +` for legibility.

## 3. Record + drive

Start the screen capture, then run the scenario. Two options:

**ffmpeg (region capture, macOS avfoundation)** — list devices first:

```bash
ffmpeg -f avfoundation -list_devices true -i ""   # find your screen index
# capture screen index 1 at 30fps into out.mp4 (Ctrl+C to stop):
ffmpeg -f avfoundation -framerate 30 -i "1:none" -pix_fmt yuv420p demo.mp4
```

In another terminal, play the scenario:

```bash
node record.mjs
```

Stop ffmpeg when the scenario ends, then trim/add voice-over in any editor.

**OBS** (if you prefer a GUI / webcam / live overlays): start recording in OBS,
run `node record.mjs`, stop OBS. (Optionally automate start/stop via
`obs-websocket`.)

## Files

- `seed.mjs` — (re)creates the demo vault.
- `lib/driver.mjs` — CDP connection + fake cursor + step captions + helpers.
- `record.mjs` — the scenario (see `scenario.md`).
- `scenario.md` — storyboard + tuning notes.

## Re-running for a new release

Re-`npm run build` the plugin, re-run `seed.mjs` (it wipes and recreates the
vault), relaunch Obsidian, and replay `record.mjs`. The run is deterministic, so
the video is reproducible.
