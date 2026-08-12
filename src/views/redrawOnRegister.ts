/*
 * Which open surfaces have to be redrawn once the view type exists.
 *
 * Obsidian restores its tabs **before** `onLayoutReady`, which is where `fileclass-table` is
 * registered — so anything already rendering a base drew before that type existed and shows
 * "Unknown view type: fileclass-table", an error on a file this plugin wrote. The repair is to draw
 * those surfaces again; the question is which ones, and that question is what lives here.
 *
 * It was answered too narrowly once: only leaves of type `bases`. A note that **embeds** a base is
 * a markdown leaf, so every dashboard stayed broken until something else touched it — found by
 * opening one of the plugin's own demo vaults. Hence a rule that asks what a surface *holds* rather
 * than what it is called.
 *
 * Pure: the impure caller reads the view type and runs the selector, and passes the answers in.
 */

/**
 * The three ways a note can hold a base: an embed of the file, an embed of one of its views, and a
 * ` ```base ` block written in the note.
 *
 * A selector rather than a matcher, because the DOM belongs to the caller. **Not covered by the
 * unit tests** — they run without a DOM, so what is pinned here is the rule below; that this
 * selector finds those three spellings is checked in the app (demo probe on take 036c's vault).
 */
export const EMBEDDED_BASE_SELECTOR =
	'.internal-embed[src$=".base"], .internal-embed[src*=".base#"], .block-language-base';

/** One open tab, as much of it as the rule needs. */
export interface OpenSurface {
	/** What Obsidian calls the leaf's view — `markdown`, `bases`, `canvas`, … */
	viewType: string;
	/** Whether its content holds a base embed (see `EMBEDDED_BASE_SELECTOR`). */
	holdsEmbeddedBase: boolean;
}

/**
 * Whether this surface has to be drawn again.
 *
 * A `bases` leaf always: it *is* a base, and its own view type is the one that arrived late. Anything
 * else only when it holds an embed — which is deliberately not restricted to markdown. A canvas card
 * renders a note, and a note may embed a base; a surface that holds one has the same problem
 * whatever it is called, and asking about the content rather than the container is what keeps the
 * next such case from needing another fix. (The canvas case follows from that reasoning; only the
 * markdown one has been reproduced.)
 */
export function needsRedraw(surface: OpenSurface): boolean {
	return surface.viewType === "bases" || surface.holdsEmbeddedBase;
}

/** The surfaces to redraw, keeping whatever the caller attached to each. */
export function surfacesToRedraw<T extends OpenSurface>(surfaces: readonly T[]): T[] {
	return surfaces.filter((s) => needsRedraw(s));
}
