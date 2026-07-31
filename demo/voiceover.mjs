#!/usr/bin/env node
/*
 * Builds the voice-over track for a scenario, from the very subtitles the take
 * showed — so the words on screen and the words spoken can't drift.
 *
 *   node voiceover.mjs 002                       # times it from the last take
 *   node voiceover.mjs 002 --take <file.json>    # a specific take log
 *   node voiceover.mjs 002 --preview             # no take needed: back-to-back
 *   node voiceover.mjs 002 --voice "Ava (Enhanced)" --rate 168
 *   node voiceover.mjs 002 --video take.mov --sync 4.2   # …and mux it in
 *   node voiceover.mjs --voices                  # what `say` can use
 *
 * `--sync` is the timecode, in the capture, of the first subtitle: the take's
 * clock starts on the cue chord, the capture starts whenever QuickTime was armed,
 * and that one number ties the two together.
 *
 * For a full release (video + captions + description + upload) use publish.mjs;
 * this stays the quick loop for hearing and tuning the narration.
 *
 * Needs macOS `say` (+ `afinfo`) and ffmpeg for the assembly.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadScenario } from "./lib/scenario.mjs";
import { latestTakeLog, takesDir } from "./lib/stage.mjs";
import { buildVoiceTrack, syncShift } from "./lib/track.mjs";
import { DEFAULT_RATE, mux, resolveVoice, voices } from "./lib/voice.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const flag = (name) => process.argv.includes(`--${name}`);
const opt = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

async function main() {
	if (flag("voices")) {
		const en = (await voices()).filter((v) => v.locale.startsWith("en"));
		const best = await resolveVoice();
		for (const v of en) console.log(`${v.name === best ? "→" : " "} ${v.name}  ${dim(v.locale)}`);
		console.log(dim("\nMore in System Settings → Accessibility → Spoken Content → Manage Voices."));
		return;
	}
	const id = process.argv.slice(2).find((a) => !a.startsWith("--"));
	const scenario = loadScenario(here, id);
	const rate = Number(opt("rate", DEFAULT_RATE));
	const voice = await resolveVoice(opt("voice"));
	const preview = flag("preview");

	const takePath = preview ? null : (opt("take") && resolve(opt("take"))) || latestTakeLog(scenario);
	if (!preview && !takePath) {
		throw new Error(
			`No take log for ${scenario.id} in ${takesDir()}.\n` +
				`Record one (node record.mjs ${scenario.id}) or use --preview to hear the script.`
		);
	}
	const take = takePath ? JSON.parse(readFileSync(takePath, "utf8")) : null;
	if (take && take.steps.length !== scenario.steps.length) {
		console.warn(
			dim(
				`Warning: the take has ${take.steps.length} steps, the scenario now has ` +
					`${scenario.steps.length} — the scenario changed since. Offsets may be off.`
			)
		);
	}

	const stamp = takePath
		? takePath.replace(/\.json$/, "")
		: join(takesDir(), `${scenario.id}-preview`);
	const outDir = `${stamp}-voice`;
	const syncMs = syncShift(opt("sync"), take);

	console.log(`Voice "${voice}" · ${rate} wpm · ${scenario.steps.length} lines`);
	console.log(dim(take ? `Timed from ${takePath}` : "Preview timing (scenario pauses)"));
	if (syncMs) console.log(dim(`Shifted by ${(syncMs / 1000).toFixed(2)}s to match --sync`));

	const { track, totalMs } = await buildVoiceTrack({
		scenario,
		take,
		outDir,
		voice,
		rate,
		syncMs,
		onLine: (c) =>
			console.log(
				`  ${String(c.index).padStart(2)}  ${(c.atMs / 1000).toFixed(1)}s  ` +
					`${(c.ms / 1000).toFixed(1)}s  ${c.text}`
			),
	});

	if (!track) {
		console.log(
			`\nffmpeg not found — the per-line files and their offsets are in\n  ${outDir}\n` +
				"Place them on your timeline from manifest.json, or install ffmpeg to get one track."
		);
		return;
	}
	console.log(`\nVoice track: ${track}  ${dim(`(${(totalMs / 1000).toFixed(1)}s)`)}`);

	const video = opt("video");
	if (!video) {
		console.log(
			dim(
				`Mux it with:  node voiceover.mjs ${scenario.id} --video <capture.mov> --sync <seconds>\n` +
					"or build the whole release with:  node publish.mjs " +
					`${scenario.id} --video <capture.mov> --sync <seconds>`
			)
		);
		return;
	}
	if (!existsSync(video)) throw new Error(`No such video: ${video}`);
	if (!syncMs) {
		console.warn(
			dim("Warning: no --sync, so the track starts at the cue chord, not at your capture's start.")
		);
	}
	const out = `${video.replace(/\.[^.]+$/, "")}-narrated.mp4`;
	await mux(video, track, out);
	console.log(`Narrated video: ${out}`);
}

main().catch((err) => {
	console.error(`\n${err?.message || err}\n`);
	process.exit(1);
});
