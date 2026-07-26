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

The driving (`record.mjs`) is **independent of the capture** — record however you
like, then play the scenario. `record.mjs` waits a couple of seconds on start so
you can hit Record first.

**QuickTime (simplest, manual)** — no setup:
File → New Screen Recording → pick the Obsidian window/region → Record. Then run
the scenario, and stop QuickTime when it ends:

```bash
node record.mjs
```

**ffmpeg (scriptable, macOS avfoundation)** — for a fully headless capture:

```bash
ffmpeg -f avfoundation -list_devices true -i ""   # find your screen index
ffmpeg -f avfoundation -framerate 30 -i "1:none" -pix_fmt yuv420p demo.mp4
```

> ffmpeg needs the **Screen Recording** permission for your terminal app
> (System Settings → Privacy & Security → Screen Recording → enable iTerm/Terminal,
> then restart it). If that's a hassle, just use QuickTime.

**OBS** (GUI / webcam / live overlays): start recording, run `node record.mjs`,
stop. (Start/stop can be automated via `obs-websocket`.)

Trim / add voice-over afterwards in any editor.

## Files

- `seed.mjs` — (re)creates the demo vault.
- `lib/driver.mjs` — CDP connection + fake cursor + step captions + helpers.
- `record.mjs` — the scenario (see `scenario.md`).
- `scenario.md` — storyboard + tuning notes.

## Re-running for a new release

Re-`npm run build` the plugin, re-run `seed.mjs` (it wipes and recreates the
vault), relaunch Obsidian, and replay `record.mjs`. The run is deterministic, so
the video is reproducible.
