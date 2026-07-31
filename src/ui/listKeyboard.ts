/*
 * Keyboard chaining for the "add a row, then another" editors — the values list
 * of a Select/Cycle/Multi, duration presets, list items.
 *
 * The loop a user actually performs is: add, type, add, type… Without help it
 * costs a mouse trip per row: the new row's input isn't focused, and Enter does
 * nothing where the row is inline. Two rules fix the whole family:
 *
 *   1. adding a row puts the caret in its input;
 *   2. Enter in that input hands focus back to the Add button.
 *
 * So the chain becomes type → Enter → Enter → type, hands on the keyboard. The
 * second rule is why focus goes to the *button* rather than to a new row
 * directly: the user stays in control of whether there is another row, and
 * Escape still leaves the editor.
 */

/**
 * Focuses `input` and, on Enter, hands focus to the editor's Add button.
 *
 * The button is passed as a getter, not an element: rows are usually rendered
 * above it, so at wiring time it may not exist yet. Resolving on Enter also
 * survives a re-render that replaces the button.
 *
 * @param input     the row's text input
 * @param addButton resolves the editor's "Add …" button
 * @param focusNow  false when re-rendering rows that already existed
 */
export function chainRowInput(
	input: HTMLInputElement,
	addButton: () => HTMLElement | null | undefined,
	focusNow: boolean
): void {
	if (focusNow) {
		// After a re-render: the element is in the DOM but not yet laid out.
		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 0);
	}
	input.addEventListener("keydown", (e) => {
		// Alt+Enter belongs to the modal's primary action (primaryAction.ts).
		if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
		// A bare Enter in a modal would submit it and close the editor.
		e.preventDefault();
		e.stopPropagation();
		addButton()?.focus();
	});
}

/**
 * Hands focus back to `addButton` once the modal a row-add opened has closed.
 *
 * Rows whose value comes from a modal (a duration, a templated item) can't use
 * `chainRowInput`: the input lives in the modal, which focuses it itself. What
 * is missing is the way back — so the user can press Enter again to add another
 * without reaching for the mouse.
 */
export function returnFocusTo(addButton: HTMLElement): void {
	// The modal closes right after its submit callback runs; queue behind it.
	window.setTimeout(() => addButton.focus(), 0);
}
