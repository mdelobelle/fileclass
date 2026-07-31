/*
 * "Alt does the other gesture" — made visible.
 *
 * A control whose Alt-click differs from its click says so in its tooltip, but a
 * tooltip is read once and forgotten. While the pointer is over the control and
 * Alt is down, the icon and label swap to the alt gesture's, so the button shows
 * what it is about to do before the click happens.
 *
 * Listeners live only for the duration of a hover: attached on mouseenter,
 * dropped on mouseleave, and dropped again if the element leaves the DOM under
 * us (a properties row re-renders on every write).
 */
import { setIcon } from "obsidian";

export interface AffordanceFace {
	icon: string;
	/** Tooltip text (aria-label — Obsidian renders it as the tooltip). */
	label: string;
}

/**
 * Swaps `el`'s icon and tooltip to the alt face while the pointer is over it and
 * Alt is held. `normal` is restored on release, on leave, and on click.
 *
 * The alt face is a **callback**, evaluated on each hover: its label carries a
 * computed value (the next date), and the control outlives the value it was
 * built for. Returning null means "no alt gesture right now" — nothing swaps.
 */
export function attachAltAffordance(
	el: HTMLElement,
	normal: AffordanceFace,
	altFace: () => AffordanceFace | null
): void {
	let showing: "normal" | "alt" = "normal";

	const paint = (face: "normal" | "alt"): void => {
		const target = face === "alt" ? altFace() : normal;
		if (!target) return;
		// The alt label is recomputed on every hover, so repaint it even when the
		// face hasn't changed — only the no-op normal→normal case can be skipped.
		if (face === showing && face === "normal") return;
		showing = face;
		const { icon, label } = target;
		// The icon is the element's only child content; the label may sit beside it
		// in a span (text-icon-button), which setIcon would wipe — so only the icon
		// holder is repainted when there is one.
		const holder = el.querySelector<HTMLElement>(":scope > .text-button-icon") ?? el;
		holder.empty();
		setIcon(holder, icon);
		el.setAttribute("aria-label", label);
	};

	const onKey = (e: KeyboardEvent): void => {
		if (!el.isConnected) return detach();
		paint(e.altKey ? "alt" : "normal");
	};
	const detach = (): void => {
		window.removeEventListener("keydown", onKey, true);
		window.removeEventListener("keyup", onKey, true);
		window.removeEventListener("blur", onLeave);
		paint("normal");
	};
	const onLeave = (): void => detach();

	el.addEventListener("mouseenter", (e) => {
		// Alt may already be down when the pointer arrives.
		paint(e.altKey ? "alt" : "normal");
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("keyup", onKey, true);
		// Holding Alt and switching app (macOS) would otherwise freeze the alt face.
		window.addEventListener("blur", onLeave);
	});
	el.addEventListener("mouseleave", onLeave);
	// After a click the row is usually rebuilt; if it isn't, don't leave the alt
	// face showing over a value that has already moved on.
	el.addEventListener("click", () => paint("normal"));
}
