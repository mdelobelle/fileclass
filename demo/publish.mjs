#!/usr/bin/env node
/*
 * Packages a take for YouTube, and optionally uploads it.
 *
 *   node publish.mjs --auth                                  # one-time OAuth
 *   node publish.mjs 002 --video ~/Movies/002.mov --sync 4.2  # build the release
 *   node publish.mjs 002 --video ~/Movies/002.mov --sync 4.2 --upload
 *   node publish.mjs 002 ... --visibility private             # override the default
 *   node publish.mjs --recent                                # last uploads + their ids
 *   node publish.mjs 002 --finish <videoId>                  # attach captions/playlist
 *                                                            #   to a video already up
 *   node publish.mjs 002 --upload-only --upload              # send again, no re-render
 *
 * Re-running `--upload` after a dropped connection resumes the transfer: the
 * session URL is kept in the release folder until the bytes are all in.
 *
 * The release folder (~/fileclass-demos/releases/<scenario>-<stamp>/) holds:
 *   video.mp4          the capture, muxed with the generated narration
 *   captions.en.srt    the subtitles with their real timings — the track YouTube
 *                      needs to auto-translate them into other languages
 *   description.txt    title + description, ready to paste if you upload by hand
 *   youtube.json       everything the upload step uses, plus its result
 *   voice/             per-line audio + manifest (the mixed track lives here)
 *
 * `--sync` is the timecode, in the capture, of the FIRST subtitle: the take's
 * clock starts on the cue chord, the capture starts whenever the recorder was
 * armed. It shifts both the voice track and the captions.
 *
 * One-time Google setup: see PUBLISHING.md.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import { cuesFromTake, toSrt } from "./lib/captions.mjs";
import { loadScenario } from "./lib/scenario.mjs";
import { syncDocs } from "./sync-docs.mjs";
import { latestTakeLog, pluginVersion, takesDir } from "./lib/stage.mjs";
import { buildVoiceTrack, syncShift } from "./lib/track.mjs";
import { DEFAULT_RATE, hasFfmpeg, mux, resolveVoice } from "./lib/voice.mjs";
import * as yt from "./lib/youtube.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, "..");
const flag = (name) => process.argv.includes(`--${name}`);
const opt = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const DOCS = "https://mdelobelle.github.io/fileclass/";
const BASE_TAGS = [
	"obsidian",
	"obsidian plugin",
	"fileclass",
	"frontmatter",
	"properties",
	"metadata",
	"note taking",
	"pkm",
];

/** `Fileclass #003 · Number, and why it isn't text` (YouTube caps titles at 100). */
function youtubeTitle(scenario) {
	const number = scenario.id.match(/^\d{3}[a-z]?/)?.[0] ?? scenario.id.slice(0, 3);
	const subject = scenario.title.replace(/^\s*fileclass\s*[—–-]\s*/i, "").trim();
	const title = `Fileclass #${number} · ${subject.charAt(0).toUpperCase()}${subject.slice(1)}`;
	return title.length > 100 ? `${title.slice(0, 97)}…` : title;
}

/** Below this, chapters clutter the description more than they help. */
const CHAPTERS_FROM_MS = 90000;

/**
 * YouTube only renders chapters when the first is at 0:00, there are at least
 * three, and each lasts 10s or more. On top of that, a one-minute take doesn't
 * want a table of contents — so they're skipped unless the take is long enough
 * AND the spacing works out.
 */
function chapters(cues, durationMs) {
	if (durationMs < CHAPTERS_FROM_MS || cues.length < 3) return [];
	const spaced = [];
	let last = -Infinity;
	for (const c of cues) {
		if (c.startMs - last < 10000) continue;
		spaced.push(c);
		last = c.startMs;
	}
	if (spaced.length < 3) return [];
	const clock = (ms) => {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
	};
	return [{ at: "0:00", text: spaced[0].text }, ...spaced.slice(1).map((c) => ({ at: clock(c.startMs), text: c.text }))];
}

function description(scenario, cues, links, durationMs, pluginVersion) {
	const marks = chapters(cues, durationMs);
	const parts = [scenario.description || scenario.title, ""];
	parts.push("In this minute:");
	for (const step of scenario.steps) parts.push(`• ${step.title}`);
	if (marks.length) {
		parts.push("", "Chapters:");
		for (const m of marks) parts.push(`${m.at} ${m.text}`);
	}
	parts.push("");
	if (links.doc) parts.push(`Docs: ${links.doc}`);
	if (links.playlist) parts.push(`The whole series: ${links.playlist}`);
	// Last line: the build this was recorded against. The series outlives releases,
	// and a viewer deserves to know how old what they're watching is.
	if (pluginVersion) parts.push("", `Recorded with Fileclass ${pluginVersion}.`);
	const text = parts.join("\n");
	return text.length > 4900 ? `${text.slice(0, 4900)}…` : text;
}

/**
 * Post-upload steps, each reported but never fatal: once the video exists, its
 * URL matters more than a caption track that can be retried.
 */
async function attach(token, { videoId, srt, language, playlistId, playlistTitle }) {
	if (srt && existsSync(srt)) {
		try {
			await yt.insertCaptions(token, { videoId, file: srt, language });
			console.log(dim("captions   attached"));
		} catch (err) {
			console.warn(dim(`captions   failed (retry with --finish ${videoId}): ${err.message}`));
		}
	}
	try {
		await yt.addToPlaylist(token, { playlistId, videoId });
		console.log(dim(`playlist   added to "${playlistTitle}"`));
	} catch (err) {
		console.warn(dim(`playlist   failed (retry with --finish ${videoId}): ${err.message}`));
	}
}

/** Release folder for a scenario's latest (or given) take. */
function releaseDir(scenario, takePath) {
	if (opt("release")) return resolve(opt("release"));
	return takePath
		? join(homedir(), "fileclass-demos", "releases", basename(takePath).replace(/\.json$/, ""))
		: null;
}

async function main() {
	if (flag("auth")) {
		const file = await yt.authorize();
		console.log(`\nAuthorized. Refresh token stored in ${file}`);
		return;
	}

	if (opt("status")) {
		const token = await yt.accessToken();
		const s = await yt.videoStatus(token, opt("status"));
		const secs = (n) => (n == null ? "?" : `${(n / 1000).toFixed(1)}s`);
		console.log(`\n${bold(s.title)}\n  ${yt.videoUrl(opt("status"))}`);
		console.log(`  upload     ${s.uploadStatus} · processing ${s.processingStatus} · ${s.privacyStatus}`);
		console.log(`  file       ${secs(s.durationMs)}${s.fileSize ? `, ${(s.fileSize / 1e6).toFixed(1)} MB` : ""}`);
		if (s.failureReason) console.log(`  failure    ${s.failureReason}`);
		for (const c of s.captions) {
			const which = c.kind === "asr" ? "YouTube's transcription" : "uploaded";
			console.log(`  captions   ${c.language} (${which}) · ${c.status}`);
		}
		if (s.uploadStatus === "uploaded" && !s.durationMs) {
			console.log(
				dim(
					"\nNo file details: YouTube never received a complete file. Delete the video and\n" +
						"re-send with --upload-only --upload (see PUBLISHING.md)."
				)
			);
		}
		return;
	}

	if (flag("recent")) {
		const token = await yt.accessToken();
		const items = await yt.recentUploads(token, 8);
		if (!items.length) console.log("No uploads on this channel yet.");
		for (const v of items) {
			console.log(
				`${v.videoId}  ${dim(String(v.privacyStatus).padEnd(8))} ${v.title}\n  ${dim(yt.videoUrl(v.videoId))}`
			);
		}
		return;
	}

	const id = process.argv.slice(2).find((a) => !a.startsWith("--"));

	// Finish a video that already exists: attach its captions and file it in the
	// playlist. The recovery path when an upload succeeded but the run died after.
	if (opt("finish")) {
		const scenario = loadScenario(here, id);
		const cfg = yt.config();
		const takePath = (opt("take") && resolve(opt("take"))) || latestTakeLog(scenario);
		const dir = releaseDir(scenario, takePath);
		const srt = dir ? join(dir, "captions.en.srt") : null;
		const token = await yt.accessToken();
		const playlistId = await yt.ensurePlaylist(token, cfg);
		console.log(`\nFinishing ${yt.videoUrl(opt("finish"))}`);
		if (srt && !existsSync(srt)) console.warn(dim(`No captions at ${srt} — skipping that step.`));
		await attach(token, {
			videoId: opt("finish"),
			srt,
			language: cfg.language,
			playlistId,
			playlistTitle: cfg.playlistTitle,
		});
		return;
	}
	const scenario = loadScenario(here, id);
	const cfg = yt.config();
	const visibility = opt("visibility", cfg.privacyStatus);

	// --upload-only retries a send without re-rendering the narration or re-muxing:
	// the muxed video in the release folder is already the file we want up.
	const uploadOnly = flag("upload-only");
	const video = opt("video") && resolve(opt("video"));
	if (!video && !uploadOnly) throw new Error("Which capture? Pass --video <file.mov>.");
	if (video && !existsSync(video)) throw new Error(`No such video: ${video}`);

	const takePath = (opt("take") && resolve(opt("take"))) || latestTakeLog(scenario);
	if (!takePath) {
		throw new Error(`No take log for ${scenario.id} in ${takesDir()} — record the take first.`);
	}
	const take = JSON.parse(readFileSync(takePath, "utf8"));
	if (take.steps.length !== scenario.steps.length) {
		console.warn(
			dim(
				`Warning: the take has ${take.steps.length} steps, the scenario now has ` +
					`${scenario.steps.length}. Re-record, or captions will drift.`
			)
		);
	}
	const syncMs = syncShift(opt("sync"), take);
	if (!syncMs) {
		console.warn(
			dim("Warning: no --sync — captions and voice will start at the cue chord, not at the capture's start.")
		);
	}

	// The take log carries the version it recorded against; fall back to the build
	// on disk for takes journalled before this was stamped.
	const recordedWith = take.pluginVersion ?? (scenario.plugin ? pluginVersion(pluginDir) : null);
	const stamp = basename(takePath).replace(/\.json$/, "");
	const outDir = join(homedir(), "fileclass-demos", "releases", stamp);
	mkdirSync(outDir, { recursive: true });
	console.log(`\n${bold(youtubeTitle(scenario))}\n${dim(outDir)}\n`);

	// --- captions ---------------------------------------------------------------
	const cues = cuesFromTake(take, syncMs);
	const srt = join(outDir, "captions.en.srt");
	writeFileSync(srt, toSrt(cues));
	console.log(`captions   ${cues.length} cues`);

	// --- narration + video ------------------------------------------------------
	let finalVideo = join(outDir, "video.mp4");
	if (uploadOnly) {
		if (!existsSync(finalVideo)) {
			throw new Error(`--upload-only needs an already built ${finalVideo} — build the release first.`);
		}
		console.log(dim("narration  reusing the video built earlier"));
	} else if (flag("no-voice")) {
		copyFileSync(video, finalVideo);
		console.log(dim("narration  skipped (--no-voice)"));
	} else {
		const voice = await resolveVoice(opt("voice"));
		const rate = Number(opt("rate", DEFAULT_RATE));
		const { track } = await buildVoiceTrack({
			scenario,
			take,
			outDir: join(outDir, "voice"),
			voice,
			rate,
			syncMs,
		});
		if (!track || !(await hasFfmpeg())) {
			throw new Error("ffmpeg is needed to mux the narration (or pass --no-voice).");
		}
		await mux(video, track, finalVideo);
		console.log(`narration  "${voice}" at ${rate} wpm, muxed`);
	}

	// --- metadata ---------------------------------------------------------------
	const docUrl = scenario.doc ? new URL(scenario.doc, DOCS).toString() : "";
	if (!docUrl) console.warn(dim(`Warning: ${scenario.id} has no \`doc:\` key — no docs link in the description.`));
	// A rebuild must not forget what was already published from this folder: the
	// video id is what the docs sync reads, and only the release folder has it.
	const metaPath = join(outDir, "youtube.json");
	const previous = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : null;
	const meta = {
		scenario: scenario.id,
		title: youtubeTitle(scenario),
		description: description(scenario, cues, { doc: docUrl, playlist: "" }, take.endedAt, recordedWith),
		tags: [...new Set([...BASE_TAGS, ...scenario.tags])],
		categoryId: cfg.categoryId,
		privacyStatus: visibility,
		language: cfg.language,
		recordedWith,
		files: { video: finalVideo, captions: srt },
		take: takePath,
		...(previous?.result ? { result: previous.result } : {}),
	};
	writeFileSync(metaPath, JSON.stringify(meta, null, 2));
	writeFileSync(join(outDir, "description.txt"), `${meta.title}\n\n${meta.description}\n`);
	console.log(`metadata   ${meta.tags.length} tags · visibility "${visibility}"`);

	if (!flag("upload")) {
		const again = uploadOnly
			? `node publish.mjs ${scenario.id} --upload-only --upload`
			: `node publish.mjs ${scenario.id} --video ${video}${opt("sync") ? ` --sync ${opt("sync")}` : ""} --upload`;
		console.log(`\nRelease ready. Upload it with:\n  ${again}`);
		return;
	}

	// --- upload -----------------------------------------------------------------
	const token = await yt.accessToken();
	const playlistId = await yt.ensurePlaylist(token, cfg);
	// The playlist URL is known only now, so the description is finalised here.
	meta.description = description(
		scenario,
		cues,
		{ doc: docUrl, playlist: yt.playlistUrl(playlistId) },
		take.endedAt,
		recordedWith
	);

	let lastPct = -1;
	const onProgress = (sent, size) => {
		const pct = Math.floor((sent / size) * 10) * 10;
		if (pct > lastPct) {
			lastPct = pct;
			process.stdout.write(`  ${pct}%\r`);
		}
	};

	// A dropped connection leaves a perfectly good session behind: remember it, so
	// re-running resumes the transfer instead of pushing the whole file again.
	const sessionFile = join(outDir, "upload-session.json");
	let uploaded;
	if (existsSync(sessionFile)) {
		const session = JSON.parse(readFileSync(sessionFile, "utf8"));
		console.log(dim(`\nresuming the previous upload session…`));
		uploaded = await yt.resumeUpload(token, { uploadUrl: session.uploadUrl, file: finalVideo, onProgress });
	} else {
		console.log("\nuploading…");
		uploaded = await yt.uploadVideo(token, {
			file: finalVideo,
			snippet: {
				title: meta.title,
				description: meta.description,
				tags: meta.tags,
				categoryId: meta.categoryId,
				defaultLanguage: meta.language,
				defaultAudioLanguage: meta.language,
			},
			status: { privacyStatus: meta.privacyStatus, selfDeclaredMadeForKids: false },
			onSession: (session) => writeFileSync(sessionFile, JSON.stringify(session, null, 2)),
			onProgress,
		});
	}
	rmSync(sessionFile, { force: true }); // the bytes are in; nothing left to resume

	const videoId = uploaded.id;
	// The video exists from here on — never let a follow-up step hide its URL.
	await attach(token, { videoId, srt, language: meta.language, playlistId, playlistTitle: cfg.playlistTitle });

	const actual = uploaded.status?.privacyStatus ?? "unknown";
	meta.result = { videoId, url: yt.videoUrl(videoId), playlistId, privacyStatus: actual };
	writeFileSync(metaPath, JSON.stringify(meta, null, 2));

	// Feed the docs and the roadmap from the release we just published, so they're
	// never behind the channel. Reporting only — it writes generated files.
	const { written, todo } = await syncDocs();
	if (written.length) console.log(dim(`docs       updated ${written.length} generated file(s)`));
	for (const p of todo) {
		console.log(dim(`docs       still to place: {{< video "${p.n}" >}} in ${p.file}`));
	}

	console.log(`\n${bold(yt.videoUrl(videoId))}`);
	console.log(dim(`visibility "${actual}"`));
	if (actual !== meta.privacyStatus) {
		console.log(
			dim(
				`\nYouTube returned "${actual}" instead of "${meta.privacyStatus}": an API project that\n` +
					"hasn't passed the compliance audit can only upload private videos. Flip it in\n" +
					"Studio, or request the audit — see PUBLISHING.md."
			)
		);
	}
}

main().catch((err) => {
	// Print the whole cause chain: undici's "fetch failed" says nothing on its own,
	// and the useful part (ECONNRESET, a socket timeout) hides one level down.
	const chain = [];
	for (let e = err; e; e = e.cause) chain.push(e.message || String(e));
	console.error(`\n${chain.join("\n  ↳ ")}\n`);
	process.exit(1);
});
