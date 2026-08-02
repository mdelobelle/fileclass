/*
 * Text-to-speech for the narration, on top of macOS `say`.
 *
 * Two uses, one source of truth (the subtitles themselves):
 *   - live (`record.mjs --speak`): hear the line as it appears, to rehearse the
 *     pacing. Not meant for the final audio — QuickTime records the mic, not the
 *     system output, so live speech only lands in the capture through a virtual
 *     audio device.
 *   - rendered (`voiceover.mjs`): one audio file per line, placed at the offsets
 *     the take actually had, assembled into a single voice track to drop on the
 *     timeline. That's the deliverable.
 *
 * Text goes to `say` through a file (`-f`), never as an argv string: lines start
 * with ellipses, contain em dashes and curly quotes, and would fight the parser.
 */
import { execFile, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const scratch = mkdtempSync(join(tmpdir(), "fc-voice-"));
let seq = 0;

/** Default speaking rate (words per minute) — `say`'s default is a bit brisk. */
export const DEFAULT_RATE = 172;

/** Preferred voice when the operator doesn't ask for one. */
export const PREFERRED_VOICES = ["Zoe (Enhanced)", "Zoe (Premium)", "Ava (Enhanced)", "Samantha"];

/**
 * How to *say* the vocabulary of this project. camelCase and file names are read
 * as one mangled word by every TTS engine, so the spoken form is spelled out
 * here while the subtitle on screen keeps the exact identifier.
 *
 * Longest key first at apply time, so `fileClass alias` beats `fileClass`.
 * Scenario-specific terms belong in the scenario's own `pronounce:` map.
 */
export const PRONUNCIATION = {
	fileClass: "file class",
	Fileclass: "File Class",
	fileclass: "file class",
	classFilesPath: "class files path",
	frontmatter: "front matter",
	MultiInput: "multi input",
	ObjectList: "object list",
	CycleDuration: "cycle duration",
	YAML: "yammel",
	// Read out, "lat, lon" is two clipped syllables that land as nonsense; the full
	// words cost half a second and are what a narrator would say.
	"lat, lon": "latitude and longitude",
	"lat,lon": "latitude and longitude",
	".base": " dot base",
	".md": " dot M D",
};

/**
 * Whole-word replacements, applied after the table above and case-sensitively.
 *
 * Separate because the table is a substring replacement — which is what lets
 * `fileClass` fix `fileClasses` too — and a short word like `id` would then eat
 * the middle of "video", "guide" and "identifier". Spelled out because `say`
 * reads `id` as the word, and a field's `id` is two letters.
 */
export const PRONUNCIATION_WORDS = {
	ID: "I D",
	IDs: "I Ds",
	id: "I D",
	ids: "I Ds",
};

/** Replaces every occurrence of `from` — plain strings, no regex escaping. */
const swap = (text, from, to) => text.split(from).join(to);

/** Replaces `from` only where it stands as a whole word. */
const swapWord = (text, from, to) =>
	text.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), to);

/**
 * What the narrator should actually say. Emoji would be read out ("party
 * popper") and em dashes get no breath, so both are normalised away; the
 * pronunciation table fixes the identifiers. `extra` is the scenario's own map,
 * which wins over the shared table.
 *
 * @param {string} title
 * @param {Record<string, string> | null} [extra]
 * @returns {string}
 */
export function spokenText(title, extra = null) {
	const table = { ...PRONUNCIATION, ...(extra ?? {}) };
	let text = title.replace(/\p{Extended_Pictographic}/gu, "");
	for (const from of Object.keys(table).sort((a, b) => b.length - a.length)) {
		text = swap(text, from, table[from]);
	}
	for (const from of Object.keys(PRONUNCIATION_WORDS).sort((a, b) => b.length - a.length)) {
		text = swapWord(text, from, PRONUNCIATION_WORDS[from]);
	}
	return text
		.replace(/\s*—\s*/g, ", ")
		.replace(/[“”]/g, "")
		.replace(/\s{2,}/g, " ")
		.trim()
		.replace(/[\s,]+$/, "");
}

/** Writes `text` to a scratch file so `say -f` can read it verbatim. */
function textFile(text) {
	const path = join(scratch, `line-${++seq}.txt`);
	writeFileSync(path, `${text}\n`, "utf8");
	return path;
}

/** All voices `say` knows, as { name, locale }. */
export async function voices() {
	const { stdout } = await run("say", ["-v", "?"]);
	return stdout
		.split("\n")
		.map((l) => l.match(/^(.+?)\s{2,}([a-z]{2}_[A-Z]{2})\s+#/))
		.filter(Boolean)
		.map((m) => ({ name: m[1].trim(), locale: m[2] }));
}

/**
 * Picks a voice: the requested one, else the first of PREFERRED_VOICES that is
 * installed. Enhanced/Premium ones are downloads (System Settings →
 * Accessibility → Spoken Content → Manage Voices), hence the fallbacks.
 */
export async function resolveVoice(requested) {
	if (requested) return requested;
	const en = (await voices()).filter((v) => v.locale.startsWith("en"));
	const pick =
		PREFERRED_VOICES.find((name) => en.some((v) => v.name === name)) ??
		en.find((v) => /\((Enhanced|Premium)\)/.test(v.name))?.name ??
		en.find((v) => v.locale === "en_US")?.name;
	if (!pick) throw new Error("No English voice available to `say`.");
	return pick;
}

/**
 * Speaks `text` now, without blocking. `handle.done` resolves when the sentence
 * ends; `handle.stop()` cuts it short (used when a take is aborted).
 */
export function speak(text, { voice, rate = DEFAULT_RATE } = {}) {
	const child = spawn("say", ["-v", voice, "-r", String(rate), "-f", textFile(text)], {
		stdio: "ignore",
	});
	const done = new Promise((resolve) => {
		child.on("exit", resolve);
		child.on("error", resolve);
	});
	return {
		done,
		stop() {
			child.kill("SIGTERM");
		},
	};
}

/**
 * Renders one line to an AIFF file and returns its duration in ms.
 *
 * `say` occasionally hangs for good on a line that renders in a second on the
 * next attempt (seen with the Enhanced voices), and a whole release build must
 * not wait on it — hence the hard timeout and one retry.
 */
export async function renderLine(text, out, { voice, rate = DEFAULT_RATE, timeout = 25000 } = {}) {
	const args = ["-v", voice, "-r", String(rate), "-o", out, "-f", textFile(text)];
	for (let attempt = 1; ; attempt++) {
		try {
			await run("say", args, { timeout, killSignal: "SIGKILL" });
			return await audioDuration(out);
		} catch (err) {
			const stalled = err.killed || err.signal === "SIGKILL";
			if (attempt >= 2) {
				throw new Error(
					`\`say\` ${stalled ? "hung" : "failed"} on "${text.slice(0, 40)}…" — ${err.message}`
				);
			}
			console.warn(`  ${stalled ? "say hung" : "say failed"}, retrying that line…`);
		}
	}
}

/** Duration of an audio file in ms, via `afinfo` (no ffprobe dependency). */
export async function audioDuration(path) {
	const { stdout } = await run("afinfo", [path]);
	const m = stdout.match(/estimated duration:\s*([\d.]+)\s*sec/i);
	if (!m) throw new Error(`Couldn't read the duration of ${path}`);
	return Math.round(Number(m[1]) * 1000);
}

/**
 * Mixes `clips` ({ file, atMs }) onto a silent bed of `totalMs`, producing one
 * voice track. Silence first so the offsets survive even if a clip is empty.
 */
export async function assemble(clips, out, totalMs) {
	const args = ["-y", "-f", "lavfi", "-t", (totalMs / 1000).toFixed(3), "-i", "anullsrc=r=44100:cl=stereo"];
	for (const c of clips) args.push("-i", c.file);
	const delays = clips
		.map((c, i) => `[${i + 1}:a]adelay=${c.atMs}|${c.atMs}[d${i}]`)
		.join(";");
	const mix = `${clips.map((_, i) => `[d${i}]`).join("")}[0:a]amix=inputs=${
		clips.length + 1
	}:normalize=0:duration=longest[out]`;
	// 48 kHz mono out: `say` renders 22 kHz, which editors resample anyway.
	args.push(
		"-filter_complex",
		`${delays};${mix}`,
		"-map",
		"[out]",
		"-ar",
		"48000",
		"-ac",
		"1",
		"-c:a",
		"aac",
		"-b:a",
		"160k",
		out
	);
	await run("ffmpeg", args, { maxBuffer: 1 << 24 });
	return out;
}

/** Muxes a voice track onto a screen capture, keeping the video stream as-is. */
export async function mux(video, audio, out) {
	await run(
		"ffmpeg",
		["-y", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", out],
		{ maxBuffer: 1 << 24 }
	);
	return out;
}

export async function hasFfmpeg() {
	return run("ffmpeg", ["-version"]).then(
		() => true,
		() => false
	);
}
