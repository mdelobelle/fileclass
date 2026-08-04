/*
 * Draggable modals: grab a modal by its title and move it.
 *
 * Why: a modal is centred, and what it hides is often what you need to look at while
 * filling it in — the note's own properties, the value in the editor behind, a base's
 * rows. Obsidian gives no way to move one, so the title becomes a handle.
 *
 * The offset lives on the modal element as a data attribute rather than in a closure:
 * our modals rebuild their content (and their title) on every render, so a handler
 * attached to a fresh title must find where the modal already is.
 *
 * This module imports nothing from Obsidian, which is what keeps `clampOffset` unit
 * testable — so **the caller decides where dragging applies**. `modalTitle` is that
 * caller, and it excludes mobile: the handle's `touch-action: none` would cost the
 * ability to scroll a modal by dragging its title.
 */

/**
 * How much of a dragged modal must stay on screen, in px. Looked at rather than reasoned
 * about: at 48px the modal reads as *gone* — a corner and three letters of its title —
 * even though it was technically grabbable. 120 keeps a piece you recognise.
 */
const KEEP_VISIBLE = 120;

export interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface Viewport {
	width: number;
	height: number;
}

/**
 * The offset to apply after a drag of (dx, dy), clamped so the modal can never be
 * dropped out of reach: its title stays on screen horizontally and vertically, which is
 * the part you would need to grab to bring it back.
 *
 * Pure, so the arithmetic is tested rather than eyeballed.
 */
export function clampOffset(
	box: Box,
	offset: { x: number; y: number },
	delta: { x: number; y: number },
	viewport: Viewport
): { x: number; y: number } {
	// Where the box sits with no offset at all — its layout position.
	const baseLeft = box.left - offset.x;
	const baseTop = box.top - offset.y;
	const minX = KEEP_VISIBLE - baseLeft - box.width; // a sliver still visible on the right
	const maxX = viewport.width - baseLeft - KEEP_VISIBLE;
	const minY = -baseTop; // never above the top edge: the handle must stay grabbable
	const maxY = viewport.height - baseTop - KEEP_VISIBLE;
	const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
	return {
		x: clamp(offset.x + delta.x, Math.min(minX, maxX), Math.max(minX, maxX)),
		y: clamp(offset.y + delta.y, Math.min(minY, maxY), Math.max(minY, maxY)),
	};
}

/** How far each modal of a stack sits from the one below it, in px. */
const CASCADE_STEP = 28;
/** Past this depth the cascade stops growing, or a deep stack marches off-screen. */
const CASCADE_MAX_STEPS = 4;

/**
 * Where the `depth`-th modal of a stack should sit: down and to the right of the one
 * below, so you can see there are several and grab the one underneath. The first is
 * centred, as Obsidian left it.
 */
export function cascadeOffset(depth: number): { x: number; y: number } {
	const steps = Math.min(Math.max(depth, 0), CASCADE_MAX_STEPS);
	return { x: steps * CASCADE_STEP, y: steps * CASCADE_STEP };
}

/** True when this modal has never been placed — neither cascaded nor dragged. */
export function hasOffset(el: HTMLElement): boolean {
	return el.dataset.fcDragX !== undefined;
}

/** Places a modal at `offset` (also the origin any later drag adds to). */
export function setOffset(el: HTMLElement, offset: { x: number; y: number }): void {
	applyOffset(el, offset);
}

/** Reads the offset a previous drag left on the element. */
function currentOffset(el: HTMLElement): { x: number; y: number } {
	return { x: Number(el.dataset.fcDragX ?? 0), y: Number(el.dataset.fcDragY ?? 0) };
}

function applyOffset(el: HTMLElement, offset: { x: number; y: number }): void {
	el.dataset.fcDragX = String(offset.x);
	el.dataset.fcDragY = String(offset.y);
	// A transform, not left/top: it composes with whatever centring Obsidian uses and
	// costs no layout.
	el.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
}

/**
 * Makes `handle` drag `modalEl`. Safe to call again on a re-rendered handle: the offset
 * is read from the modal, and the listeners belong to the handle, which is discarded
 * with the render that made it.
 *
 * Pointer events rather than mouse events: one code path for trackpad, mouse and pen,
 * and `setPointerCapture` keeps the drag alive when the pointer outruns the handle.
 */
export function makeDraggable(modalEl: HTMLElement, handle: HTMLElement): void {
	handle.addClass("fileclass-drag-handle");
	handle.addEventListener("pointerdown", (e: PointerEvent) => {
		// Never hijack a gesture meant for something in the title row (a button, a text
		// selection with a modifier), and never react to a right-click.
		if (e.button !== 0) return;
		const target = e.target as HTMLElement | null;
		if (target?.closest("button, input, select, textarea, a, .clickable-icon")) return;

		const start = { x: e.clientX, y: e.clientY };
		const from = currentOffset(modalEl);
		const box = modalEl.getBoundingClientRect();
		handle.setPointerCapture(e.pointerId);
		handle.addClass("is-dragging");
		e.preventDefault(); // no text selection while dragging

		const move = (ev: PointerEvent): void => {
			const next = clampOffset(
				{ left: box.left, top: box.top, width: box.width, height: box.height },
				from,
				{ x: ev.clientX - start.x, y: ev.clientY - start.y },
				{ width: window.innerWidth, height: window.innerHeight }
			);
			applyOffset(modalEl, next);
		};
		const end = (): void => {
			handle.removeClass("is-dragging");
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", end);
			handle.removeEventListener("pointercancel", end);
		};
		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", end);
		handle.addEventListener("pointercancel", end);
	});
}
