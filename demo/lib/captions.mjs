/*
 * SRT captions from a take log.
 *
 * The subtitles are burned into the capture (they're drawn inside Obsidian), so
 * this track isn't there for English viewers — it's the source YouTube needs to
 * auto-translate them into every other language. Which is why the text is the
 * on-screen text, verbatim: what a French viewer reads must be a translation of
 * what's burned in, not of a paraphrase.
 *
 * Timings come from the take itself: `shownAt` is the frame the caption faded in,
 * `cuedAt` the frame it faded out.
 */

/** `12345` → `00:00:12,345` */
export function timecode(ms) {
	const clamped = Math.max(0, Math.round(ms));
	const h = Math.floor(clamped / 3600000);
	const m = Math.floor((clamped % 3600000) / 60000);
	const s = Math.floor((clamped % 60000) / 1000);
	const frac = clamped % 1000;
	const pad = (n, w = 2) => String(n).padStart(w, "0");
	return `${pad(h)}:${pad(m)}:${pad(s)},${pad(frac, 3)}`;
}

/** Shortest cue worth showing — YouTube drops flashes below ~1 frame. */
const MIN_CUE_MS = 700;

/**
 * Cues from a take log, shifted onto the capture's clock. `shiftMs` is the same
 * correction the voice track uses (`--sync`): the take's zero is the starting
 * cue, the capture's zero is whenever the recorder was armed.
 */
export function cuesFromTake(take, shiftMs = 0) {
	const steps = [...take.steps].sort((a, b) => a.shownAt - b.shownAt);
	const cues = [];
	for (const [i, step] of steps.entries()) {
		const start = step.shownAt + shiftMs;
		let end = (step.cuedAt ?? step.shownAt + MIN_CUE_MS) + shiftMs;
		if (end - start < MIN_CUE_MS) end = start + MIN_CUE_MS;
		// Never overlap the next caption: only one is ever on screen.
		const nextStart = steps[i + 1] ? steps[i + 1].shownAt + shiftMs : Infinity;
		cues.push({
			index: cues.length + 1,
			text: step.title,
			startMs: Math.max(0, start),
			endMs: Math.max(0, Math.min(end, nextStart - 40)),
		});
	}
	return cues.filter((c) => c.endMs > c.startMs);
}

export function toSrt(cues) {
	return `${cues
		.map((c) => `${c.index}\n${timecode(c.startMs)} --> ${timecode(c.endMs)}\n${c.text}`)
		.join("\n\n")}\n`;
}
