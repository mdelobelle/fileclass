/*
 * Arrow-key navigation over a list of rows that each carry the same handful of
 * actions — the schema editor's field list, and the same list scoped to an
 * object's children.
 *
 * Why: reaching the eighth field's Edit button took thirty-odd Tab presses, because
 * every row contributes four or five stops (fifty-five in a class of a dozen
 * fields). Treating the list as a grid makes it two: land on Edit once, then hold
 * ↓ until you are on the field you want.
 *
 * The navigation is by **action identity**, not by column index: a group row has an
 * extra Children button, so moving down by index would slide Edit onto Remove —
 * one keystroke from deleting a field instead of editing it.
 */

/** Where the focus is, or should go: a row and one of its actions. */
export interface GridTarget {
	row: number;
	action: number;
}

/** Keys this grid answers. Anything else is left to the browser. */
const KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"]);

export function handlesKey(key: string): boolean {
	return KEYS.has(key);
}

/**
 * The action to land on in `names` when arriving from `wanted`: the same action if
 * that row has it, else the nearest column that exists.
 */
function resolveAction(names: readonly string[], wanted: string, from: number): number {
	if (!names.length) return 0;
	const same = names.indexOf(wanted);
	if (same !== -1) return same;
	return Math.min(Math.max(from, 0), names.length - 1);
}

/**
 * The next focus target for `key`, or null when the key isn't ours or the move
 * would leave the grid. Clamps rather than wraps: a list that jumps from its last
 * row to its first reads as a glitch, and Tab is how you leave.
 *
 * @param rows action names per row, in DOM order
 */
export function nextGridTarget(
	rows: readonly (readonly string[])[],
	current: GridTarget,
	key: string
): GridTarget | null {
	if (!handlesKey(key) || !rows.length) return null;
	const row = Math.min(Math.max(current.row, 0), rows.length - 1);
	const here = rows[row] ?? [];
	const action = Math.min(Math.max(current.action, 0), Math.max(here.length - 1, 0));
	const wanted = here[action] ?? "";

	if (key === "ArrowRight" || key === "ArrowLeft") {
		const next = action + (key === "ArrowRight" ? 1 : -1);
		if (next < 0 || next >= here.length) return null;
		return { row, action: next };
	}

	const target =
		key === "Home" ? 0 : key === "End" ? rows.length - 1 : row + (key === "ArrowDown" ? 1 : -1);
	if (target < 0 || target >= rows.length) return null;
	if (target === row) return null;
	return { row: target, action: resolveAction(rows[target], wanted, action) };
}

export interface RowGridOptions {
	/** Rows within the container, in DOM order. */
	rowSelector: string;
	/** The actions inside a row: buttons, icon buttons. */
	actionSelector: string;
	/** Action to focus first, by accessible name (falls back to the first). */
	preferred?: string;
}

/**
 * Wires arrow navigation and a single tab stop over `container`.
 *
 * The single tab stop is the other half of the win: Tab reaches the list, the arrows
 * move inside it, Tab leaves for the footer — instead of walking every button of
 * every row. Returns a detach function; call it when the view is rebuilt.
 */
export function attachRowGrid(container: HTMLElement, opts: RowGridOptions): () => void {
	const rowsOf = (): HTMLElement[] =>
		Array.from(container.querySelectorAll<HTMLElement>(opts.rowSelector));
	const actionsOf = (row: HTMLElement): HTMLElement[] =>
		Array.from(row.querySelectorAll<HTMLElement>(opts.actionSelector));
	const nameOf = (el: HTMLElement): string =>
		(el.getAttribute("aria-label") ?? el.textContent ?? "").trim();

	let current: GridTarget = { row: 0, action: 0 };

	const rovingTabIndex = (): void => {
		rowsOf().forEach((row, r) =>
			actionsOf(row).forEach((el, a) => {
				el.tabIndex = r === current.row && a === current.action ? 0 : -1;
			})
		);
	};

	const focusTarget = (target: GridTarget, moveFocus: boolean): void => {
		current = target;
		rovingTabIndex();
		if (!moveFocus) return;
		actionsOf(rowsOf()[target.row] ?? container)[target.action]?.focus();
	};

	// Start on the preferred action of the first row, so Tab lands somewhere useful.
	const rows = rowsOf();
	if (rows.length) {
		const names = actionsOf(rows[0]).map(nameOf);
		const start = opts.preferred ? names.indexOf(opts.preferred) : 0;
		focusTarget({ row: 0, action: start === -1 ? 0 : start }, false);
	}

	const onKeyDown = (e: KeyboardEvent): void => {
		const el = e.target as HTMLElement | null;
		// Never steal a key from something being typed in.
		if (el?.matches("input, textarea, select, [contenteditable='true']")) return;

		/*
		 * Enter and Space fire the focused action. The grid walks over Obsidian's
		 * `clickable-icon`s, which are **divs**: they take focus because we give them a tab
		 * index, and then the keyboard did nothing at all — you could arrow onto a field's
		 * pencil and press Enter forever. A <button> handles this itself, so only the icons
		 * need it, and only when they are the thing focused.
		 */
		if ((e.key === "Enter" || e.key === " ") && el && !el.closest("button")) {
			const action = el.closest<HTMLElement>(opts.actionSelector);
			if (action && container.contains(action)) {
				e.preventDefault();
				e.stopPropagation();
				action.click();
			}
			return;
		}
		if (!handlesKey(e.key)) return;
		const grid = rowsOf();
		const rowIndex = grid.findIndex((row) => el && row.contains(el));
		if (rowIndex === -1) return;
		const names = grid.map((row) => actionsOf(row).map(nameOf));
		const actionIndex = actionsOf(grid[rowIndex]).findIndex((a) => a === el || a.contains(el));
		const target = nextGridTarget(names, { row: rowIndex, action: Math.max(actionIndex, 0) }, e.key);
		if (!target) return;
		e.preventDefault();
		e.stopPropagation();
		focusTarget(target, true);
	};

	// A click reseats the tab stop where the operator just was.
	const onFocusIn = (e: FocusEvent): void => {
		const el = e.target as HTMLElement | null;
		const grid = rowsOf();
		const rowIndex = grid.findIndex((row) => el && row.contains(el));
		if (rowIndex === -1) return;
		const actionIndex = actionsOf(grid[rowIndex]).findIndex((a) => a === el || a.contains(el));
		if (actionIndex === -1) return;
		focusTarget({ row: rowIndex, action: actionIndex }, false);
	};

	container.addEventListener("keydown", onKeyDown);
	container.addEventListener("focusin", onFocusIn);
	return () => {
		container.removeEventListener("keydown", onKeyDown);
		container.removeEventListener("focusin", onFocusIn);
	};
}
