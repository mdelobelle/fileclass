# Fileclass onboarding-video tooling

Full-auto: seed a demo vault, drive Obsidian over CDP, record the screen.
Self-contained (its own `package.json`); not part of the plugin build.

## Prerequisites

- The plugin built once (from the repo root): `npm run build`.
- `ffmpeg` (for recording): `brew install ffmpeg`.
- Deps here: `cd demo && npm install`.

## 1. Seed a demo vault

```bash
node seed.mjs                       # defaults to ~/fileclass-demo-vault
# or: node seed.mjs --vault /some/path/outside/any/vault
```

Creates a fresh vault (plugin installed + enabled, `classFilesPath = Classes/`,
a ready **Book** fileClass, plain notes in `Library/`).

> **Important:** the vault must live **outside** any existing vault — a vault
> nested inside another can't be opened. That's why the default is in your home
> folder, not under the plugin.

## 2. Open the vault once, then relaunch with remote debugging

Obsidian can't open an arbitrary folder as a vault from a URI or `open -a`, so
register it once:

1. In Obsidian: **Open another vault → Open folder as vault** → pick the seeded
   folder (e.g. `~/fileclass-demo-vault`).
2. **Turn off Restricted mode** (trust the vault) so the **Fileclass** and core
   **Bases** plugins load. Confirm Bases is enabled.
3. **Quit Obsidian completely.**
4. Relaunch with the debug port — it reopens the last vault (this one):

   ```bash
   open -na Obsidian --args --remote-debugging-port=9222
   ```

   If it opens a different vault, just switch to the demo vault in the picker —
   the debug port stays active on the same process.

Then size the window for recording and (optional) bump zoom with `Cmd +`.

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
