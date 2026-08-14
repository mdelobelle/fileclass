/*
 * When a suggester draws its next page (pure).
 *
 * Obsidian's SuggestModal caps what it draws at `limit`, 100 by default, and says nothing about
 * the rest: measured on a vault of 412 candidates, the picker offered 100 and the other 312 were
 * indistinguishable from notes that do not exist. Paging is the answer rather than "draw
 * everything", because a suggester re-runs its search on every keystroke — drawing thousands of
 * rows each time would tax the common case (type two letters, pick) to serve the rare one.
 */

/** How many matches are drawn at once, and how near the end another page is asked for. */
export const SUGGEST_PAGE = 100;
export const SUGGEST_PAGE_TRIGGER = 80;

export interface ScrollState {
	scrollTop: number;
	clientHeight: number;
	scrollHeight: number;
}

/** Whether the reader has reached the end of what is drawn, with more to draw. */
export function shouldGrow(scroll: ScrollState, shown: number, total: number): boolean {
	if (shown >= total) return false;
	return scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - SUGGEST_PAGE_TRIGGER;
}

/** The next page size, never past the end. */
export function grownTo(shown: number, total: number): number {
	return Math.min(shown + SUGGEST_PAGE, total);
}

/** What the footer says, or null when everything is on screen and it should not be there. */
export function truncationLabel(shown: number, total: number): string | null {
	return total > shown ? `${shown} of ${total} — scroll for more` : null;
}
