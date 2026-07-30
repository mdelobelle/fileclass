# Publishing a take to YouTube

`publish.mjs` turns a recorded take into a release folder — video with narration,
captions, title, description — and uploads it to the channel, adds the captions
track and files it in the series playlist.

```bash
node publish.mjs --auth                                     # once, ever
node publish.mjs 002 --video ~/Movies/002.mov --sync 4.2     # build, check it
node publish.mjs 002 --video ~/Movies/002.mov --sync 4.2 --upload
```

`--sync` is the timecode, **in your capture**, at which the first subtitle
appears. The take's clock starts on your cue chord and the capture starts whenever
you armed QuickTime; that one number aligns the captions *and* the voice track
with the picture. Scrub to the first subtitle, read the timecode, pass it.

Other flags: `--visibility private|unlisted|public` (overrides the default),
`--no-voice` (keep the capture's audio as-is), `--voice` / `--rate`, `--take
<file.json>` to package an older take.

## One-time Google setup

About five minutes, once. Everything lands in `~/.config/fileclass-demo/`, outside
the repo.

1. **Create a project** at <https://console.cloud.google.com/projectcreate> (any
   name — it's yours alone).
2. **Enable the API**: APIs & Services → Library → *YouTube Data API v3* → Enable.
3. **OAuth consent screen**: External, fill in the app name and your email, and
   add your own Google account under *Test users*. Testing mode is enough — this
   app has exactly one user.
4. **Credentials** → Create credentials → OAuth client ID → Application type
   **Desktop app** → Create → Download JSON.
5. Save that file as `~/.config/fileclass-demo/client_secret.json`.
6. Run `node publish.mjs --auth`. The browser opens, you approve (Google will warn
   that the app is unverified — it's yours, continue), and the refresh token is
   stored in `~/.config/fileclass-demo/tokens.json`. Never commit either file.

Optional `~/.config/fileclass-demo/config.json`:

```json
{
  "playlistTitle": "Fileclass for Obsidian",
  "playlistId": "",
  "categoryId": "28",
  "privacyStatus": "public",
  "language": "en"
}
```

`playlistId` empty means: find the playlist by title, create it if it doesn't
exist. `categoryId` 28 is *Science & Technology* (27 is *Education*).

## Two YouTube limits worth knowing

**Visibility can be downgraded to `private`.** YouTube may lock uploads from an API
project that hasn't passed its compliance audit, whatever `privacyStatus` was
requested — it did *not* happen on this channel (take 001 went up public on the
first try), so treat it as a possibility rather than a certainty. The script prints
the status the API actually returned: if it says `private` while you asked for
`public`, either flip the video in Studio (30 seconds, and the URL is already the
final one) or request the audit at
<https://support.google.com/youtube/contact/yt_api_form>.

**Quota.** 10,000 units a day, and `videos.insert` costs 1,600 — about six uploads
per day. Ample for this series, but don't script a batch of twenty.

## When an upload seems to fail

A transfer that reaches 100% and then errors has almost certainly *worked*: the
bytes were accepted and only the response was lost on the way back. So check
before re-uploading.

```bash
node publish.mjs --recent                    # the channel's last uploads + their ids
node publish.mjs 001 --finish <videoId>      # attach the captions, file it in the playlist
```

`--finish` is the recovery path for a video that exists but missed its follow-up
steps. It reads `captions.en.srt` from the release folder of the scenario's latest
take (`--release <dir>` to point elsewhere).

If the transfer died *before* finishing, just re-run the same `--upload` command:
the resumable session URL is kept in `upload-session.json` inside the release
folder, so the run picks up where it stopped instead of pushing the whole file
again. The file is deleted once the bytes are all in.

```bash
node publish.mjs 001 --upload-only --upload   # send again, no re-render, no re-mux
```

`--upload-only` reuses the `video.mp4` already in the release folder. Use it for any
retry: re-rendering sixteen lines of narration to resend the same bytes is waste,
and each render is another chance for `say` to stall.

### A video stuck on "processing will begin soon"

Ask the API rather than guessing in Studio:

```bash
node publish.mjs --status <videoId>
```

```
Fileclass #001 · Install and set up
  https://www.youtube.com/watch?v=KKG_36JGjWA
  upload     processed · processing succeeded · public
  file       107.6s
  captions   en (uploaded) · serving
  captions   en (YouTube's transcription) · serving
```

`uploadStatus: uploaded` with **no file details**, an hour on, means YouTube never
received a complete file: the resumable session was never closed, because the
response that says "the file is whole" is exactly what got lost. There's no way to
finish a session whose URL you no longer have — delete the video and send it again
with `--upload-only --upload`. The current code can't leave a video in that state:
it only returns once YouTube answers 200/201, and re-queries the session when the
connection drops.

Two English caption tracks is normal, by the way: the one this pipeline uploads
(`standard`) plus the transcription YouTube generates from the narration (`asr`).
YouTube serves ours and uses it as the translation source.

Post-upload steps never mask the video's URL: a caption track that fails to attach
is reported with the `--finish` command to retry it, and the URL is printed anyway.

## What lands in the release folder

`~/fileclass-demos/releases/<scenario>-<take stamp>/`

| File | What it is |
| ---- | ---------- |
| `video.mp4` | your capture, muxed with the generated narration |
| `captions.en.srt` | the subtitles at their real timings |
| `description.txt` | title + description, ready to paste for a manual upload |
| `youtube.json` | everything the upload uses — and, afterwards, the video id and URL |
| `voice/` | one audio file per line, the mixed track, and a manifest of offsets |

Nothing is deleted between takes, so an older release stays reproducible.

## The version a take was recorded against

The description ends with **"Recorded with Fileclass X.Y.Z"** — the version the
fixture installed, journalled by `record.mjs` and carried into `youtube.json` and the
doc card. The series will outlive several releases; a viewer deserves to know how old
what they are watching is, and you deserve to know which takes to re-shoot after a UI
change. Take 001 has no stamp: it installs the plugin from the community store on
camera, so the build is whatever the store served that day.

## Why a caption track when the subtitles are burned in

The burned-in bar is what makes a video readable with the sound off and captions
off. The `.srt` exists for a different reason: it's the source YouTube needs to
**auto-translate** the narration into every other language. An English viewer never
turns it on; a French or Japanese viewer gets a translated track over an English
burn-in, which reads fine.

That's also why the caption text is the on-screen text, verbatim: what a translated
viewer reads has to be a translation of what's burned in, not of a paraphrase.

## Back into the docs

`publish.mjs` runs the docs sync after a successful upload, and you can run it on
its own:

```bash
node sync-docs.mjs           # scan the releases, write the generated files
node sync-docs.mjs --check   # report what would change
```

It reads every release folder holding a `youtube.json` with a `result.videoId` and
writes three things:

| Target | Content |
| ------ | ------- |
| `docs/data/videos.json` | id, URL, title, duration and doc anchor, keyed by take number |
| `docs/content/videos.md` | the generated series index (regenerated wholesale) |
| `demo/ROADMAP.md` | the Status cell of each published row, linked to its video |

Then, in the prose, one shortcode places a link wherever it belongs:

```markdown
{{< video "002" >}}         a link card — no request to YouTube until clicked
{{< video-embed "001" >}}   a real player, for the rare page that wants one
```

The sync never edits the prose pages — where a video belongs inside an explanation
is an editorial decision — so it prints the shortcode line and the page each take's
`doc:` key points at. Paste it once; later syncs keep the data behind it current.
A page may reference a take before it's recorded: the shortcode renders nothing and
warns during the build until the video exists.

## Uploading by hand instead

Everything needed is in the release folder: drag `video.mp4` into YouTube Studio,
paste `description.txt` (first line is the title), and add `captions.en.srt` under
Subtitles → English. Same result, about two minutes per video.
