/*
 * Builds a take's voice track: render each subtitle, lay it where its caption
 * appeared, mix one file. Shared by `voiceover.mjs` (listen / iterate) and
 * `publish.mjs` (package for YouTube), so the audio in a release is byte-for-byte
 * what the preview played.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { assemble, hasFfmpeg, renderLine, spokenText } from "./voice.mjs";

/**
 * @param take      a take log, or null to time the lines back-to-back (preview)
 * @param syncMs    shift applied to every offset (the capture's clock)
 * @param onLine    called per rendered line, for progress output
 * @returns { clips, totalMs, track, manifest } — `track` is null without ffmpeg
 */
export async function buildVoiceTrack({
	scenario,
	take = null,
	outDir,
	voice,
	rate,
	syncMs = 0,
	onLine = null,
}) {
	mkdirSync(join(outDir, "lines"), { recursive: true });

	const clips = [];
	let cursor = scenario.initialPause;
	for (const [i, step] of scenario.steps.entries()) {
		const text = spokenText(step.title, scenario.pronounce);
		if (!text) continue; // a subtitle made only of an emoji has nothing to say
		const file = join(outDir, "lines", `${String(i + 1).padStart(2, "0")}.aiff`);
		const ms = await renderLine(text, file, { voice, rate });
		const atMs = take?.steps[i]?.shownAt ?? cursor;
		cursor = atMs + ms + step.pause;
		const clip = { index: i + 1, file, atMs, ms, text };
		clips.push(clip);
		onLine?.(clip);
	}

	if (syncMs && clips.length) for (const c of clips) c.atMs = Math.max(0, c.atMs + syncMs);

	const totalMs =
		Math.max(take ? take.endedAt + syncMs : 0, ...clips.map((c) => c.atMs + c.ms)) + 1500;
	const manifest = { scenario: scenario.id, voice, rate, syncMs, totalMs, clips };
	writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

	let track = null;
	if (clips.length && (await hasFfmpeg())) {
		track = join(outDir, "voiceover.m4a");
		await assemble(clips, track, totalMs);
	}
	return { clips, totalMs, track, manifest };
}

/**
 * The `--sync` correction in ms: the video timecode of the first subtitle minus
 * where the take log says it was. Null when the operator didn't measure it.
 */
export function syncShift(syncSeconds, take) {
	if (syncSeconds == null || syncSeconds === "") return 0;
	const first = take?.steps?.[0]?.shownAt ?? 0;
	return Math.round(Number(syncSeconds) * 1000) - first;
}
