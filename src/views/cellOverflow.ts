/*
 * How many items a `fileclass-table` cell shows, and how many it counts (#…).
 *
 * A cell's items shrink and ellipsize, which reads well for two or three and not at all for
 * twelve: measured on a real vault, a `MultiFile` cell holding eighteen links drew 480px of
 * icons inside a 260px column — the names squeezed to nothing, the icons unable to shrink at
 * all, the whole run spilling over the columns to its right.
 *
 * So the cell stops showing what it cannot show. An item is worth drawing while it keeps a
 * readable share of the width; past that the rest are counted in a `+N` at the right edge.
 * Pure arithmetic over widths the caller measured — the DOM half lives in fileclassTableView.
 */

/**
 * The width an item needs before drawing it says more than counting it, in `em`.
 *
 * Eight, which at the table's own font size is about a dozen characters — enough for a first
 * name and the start of a second. Six was tried first and showed three names in a 260px column,
 * each cut to "Vanne…": more items, less said.
 */
export const MIN_ITEM_EM = 8;

export interface FitInput {
	/** Natural width of each item, in px, in the order they are drawn. */
	widths: readonly number[];
	/** The width inside the cell. */
	available: number;
	/** The gap between two neighbours. */
	gap: number;
	/** The width of the `+N` indicator, which only costs anything once something is hidden. */
	badge: number;
	/** The least width an item may be squeezed to and still be worth showing. */
	min: number;
}

/**
 * How many items to show: all of them when they fit as drawn, else as many as keep `min` each,
 * and never fewer than one — a lone item too wide for its cell is the ellipsis case, not the
 * counted one, and hiding it would leave a cell holding nothing but a `+1`.
 */
export function fittingItems({ widths, available, gap, badge, min }: FitInput): number {
	const n = widths.length;
	if (n <= 1) return n;
	const natural = widths.reduce((sum, w) => sum + w, 0) + gap * (n - 1);
	if (natural <= available) return n;

	let used = 0;
	let shown = 0;
	for (const width of widths) {
		// An item never costs more than the floor it may be squeezed to, and the badge's room is
		// held back throughout: we already know the whole run does not fit.
		const cost = (shown ? gap : 0) + Math.min(width, min);
		if (used + cost + gap + badge > available) break;
		used += cost;
		shown += 1;
	}
	return Math.max(1, shown);
}

/** What the `+N` reads, or null when the cell shows everything it has. */
export function moreLabel(total: number, shown: number): string | null {
	return shown < total ? `+${total - shown}` : null;
}
