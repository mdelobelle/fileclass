# Fileclass onboarding-video tooling

Seed a demo vault, drive Obsidian over CDP, record the screen. The driver types,
sets values, and detects results; **you do the mouse clicks** (see the handoff
model below), so the pointer moves naturally on camera. Self-contained (its own
`package.json`); not part of the plugin build.

## Prerequisites

- The plugin built once (from the repo root): `npm run build`.
- Deps here: `cd demo && npm install`.
- A screen recorder — QuickTime is easiest (`ffmpeg` optional, see step 3).

## 1. Seed a demo vault

```bash
node seed.mjs                       # defaults to ~/fileclass-demo-vault
# or: node seed.mjs --vault /some/path/outside/any/vault
```

Creates a fresh vault with **only** the plugin installed + enabled. Everything
else — the `Classes/` folder, the `classFilesPath` setting, every fileClass and
note — is created live, on camera, by `record.mjs`.

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
node record.mjs        # the whole story (acts 1 → 3)
node record.mjs 1      # act 1 only (install + configure)
node record.mjs 2      # act 2 only (define Author + author notes)
node record.mjs 3      # act 3 only (base table + linked Book; needs act 2 first)
```

### You drive the clicks (handoff model)
The driver never clicks. When the bottom caption turns **purple and ends with
`…`**, it's your turn: do the named click — a button, a pencil ✎, a command in
the palette, a right-click menu item, or an option in a list. The driver watches
the DOM and resumes automatically once your click takes effect, so you set the
pace of the mouse. (The right-click menu opens in a separate window the debug
port can't reach, so it must be manual anyway.) There's no fake cursor — add a
pointer in post if you want one.

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

- `seed.mjs` — (re)creates the demo vault (plugin only; guards against nuking
  real data).
- `lib/driver.mjs` — CDP connection, step captions, purple click-handoffs, and
  DOM detectors.
- `record.mjs` — the scenario, in three steps (see `scenario.md`).
- `scenario.md` — storyboard + how the handoff model works.

## Re-running for a new release

Re-`npm run build` the plugin, re-run `seed.mjs` (it wipes and recreates the
vault), relaunch Obsidian, and replay `record.mjs`. The run is deterministic, so
the video is reproducible.
