/*
 * The one way this plugin opens a colour picker.
 *
 * Obsidian's own accent-colour setting is a plain, visible `<input type="color">`
 * sitting directly in its row, and its popover behaves. Ours used to be an
 * invisible input (`opacity: 0`, absolutely positioned) inside a `<label>` that
 * activated it — which looked identical and did not behave: opening the popover
 * from the settings window emptied the settings pane behind it, leaving the tab
 * selected with nothing in it (reported on 1.13.4, and not reproducible without a
 * hand on the mouse — a synthesized click never opens the popover).
 *
 * So this mirrors what works: a real input, visible, unwrapped, shaped by CSS into
 * the same circle. An optional corner badge marks the "add" affordance without
 * covering the swatch and without intercepting the click.
 */
import { setIcon } from "obsidian";

const HEX6_RE = /^#[0-9a-f]{6}$/iu;

export interface ColorInputOptions {
	/** Accessible name; also the tooltip. */
	label: string;
	/** Starting value; anything that isn't a 6-digit hex falls back to grey. */
	value?: string;
	/** Extra class on the input (`is-add`, `is-custom`…). */
	cls?: string;
	/** Icon painted in a corner badge — decorative, never clickable. */
	badge?: string;
	onPick: (value: string) => void;
}

/**
 * Appends a colour input shaped like our swatch circles. Returns it so a caller
 * can keep a handle on the element (tests, focus).
 */
export function colorCircleInput(parent: HTMLElement, opts: ColorInputOptions): HTMLInputElement {
	const slot = parent.createDiv({ cls: "fileclass-color-slot" });
	const input = slot.createEl("input", {
		cls: ["fileclass-color-circle", opts.cls].filter(Boolean).join(" "),
		attr: { type: "color", "aria-label": opts.label, title: opts.label },
	});
	input.value = HEX6_RE.test(opts.value?.trim() ?? "") ? (opts.value as string).trim() : "#b0b0b0";
	if (opts.badge) {
		const badge = slot.createSpan({ cls: "fileclass-color-slot-badge" });
		setIcon(badge, opts.badge);
	}
	input.addEventListener("change", () => opts.onPick(input.value));
	return input;
}
