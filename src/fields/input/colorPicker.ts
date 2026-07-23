/*
 * Color picker (#33). Mirrors the Obsidian canvas color picker UI: one row of
 * circular swatches — "no color", the palette colors, and a rainbow "custom"
 * circle that opens the native color dialog (via a hidden <input type="color">
 * triggered by .click(), so the theme-styled native control is never rendered).
 * The palette comes from an extensible source registry; storage is a raw CSS
 * color scalar (the palette is a picker concern, not a storage one).
 */
import { App, Modal, setIcon } from "obsidian";

import { isValidCssColor } from "../color";
import { addCustomColor, customColors } from "../customPalette";

export interface ColorSwatch {
	label: string;
	value: string;
}

export interface ColorSource {
	id: string;
	label: string;
	swatches: ColorSwatch[];
}

/** The Obsidian canvas palette (values from the canvas color chips). */
const CANVAS_PALETTE: ColorSwatch[] = [
	{ label: "Red", value: "#fb464c" },
	{ label: "Orange", value: "#ec7500" },
	{ label: "Yellow", value: "#e0ac00" },
	{ label: "Green", value: "#08b94e" },
	{ label: "Cyan", value: "#00b7d3" },
	{ label: "Purple", value: "#7852ee" },
];

/** Palette sources ("banks"). Extensible: add providers without a new field type. */
export const COLOR_SOURCES: ColorSource[] = [
	{ id: "canvas", label: "Canvas", swatches: CANVAS_PALETTE },
];

export function colorSourceById(id: string): ColorSource {
	return COLOR_SOURCES.find((s) => s.id === id) ?? COLOR_SOURCES[0];
}

export interface ColorPickerOptions {
	title: string;
	initial: string;
	source: string;
	onSubmit: (value: string) => void;
}

const HEX6_RE = /^#[0-9a-f]{6}$/iu;

/** A hidden native color input, activated by clicking its wrapping label. */
function colorTrigger(label: HTMLElement, initialHex: string, onPick: (v: string) => void): void {
	const input = label.createEl("input", { cls: "fileclass-color-hidden", attr: { type: "color" } });
	input.value = HEX6_RE.test(initialHex) ? initialHex : "#000000";
	input.addEventListener("change", () => onPick(input.value));
}

export class ColorPickerModal extends Modal {
	constructor(app: App, private readonly opts: ColorPickerOptions) {
		super(app);
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: this.opts.title });

		const current = this.opts.initial.trim();
		const currentLc = current.toLowerCase();
		const row = contentEl.createDiv({ cls: "fileclass-color-circles" });

		// "No color" (clear).
		const clear = row.createEl("button", {
			cls: "fileclass-color-circle is-clear",
			attr: { "aria-label": "No color", title: "No color" },
		});
		if (!current) clear.addClass("is-selected");
		clear.onclick = () => this.pick("");

		// Swatches in order: standard palette, saved custom colors, then the value
		// currently stored on the note if it isn't already shown. De-duped.
		const seen = new Set<string>();
		const addSwatch = (value: string, label: string): void => {
			const lc = value.toLowerCase();
			if (seen.has(lc)) return;
			seen.add(lc);
			const circle = row.createEl("button", {
				cls: "fileclass-color-circle",
				attr: { "aria-label": label, title: label },
			});
			circle.setCssStyles({ backgroundColor: value });
			if (lc === currentLc) circle.addClass("is-selected");
			circle.onclick = () => this.pick(value);
		};

		for (const s of colorSourceById(this.opts.source).swatches) addSwatch(s.value, `${s.label} (${s.value})`);
		for (const c of customColors()) addSwatch(c, c);
		if (current && isValidCssColor(current)) addSwatch(current, current);

		// "+" — pick a color and pin it to the saved palette (label opens the
		// native dialog; stays open so the new swatch appears).
		const add = row.createEl("label", {
			cls: "fileclass-color-circle is-add",
			attr: { "aria-label": "Add to my colors…", title: "Add to my colors…" },
		});
		setIcon(add, "plus");
		colorTrigger(add, current, (v) => void addCustomColor(v).then(() => this.render()));

		// Rainbow — pick a one-off custom color (applies, doesn't save).
		const custom = row.createEl("label", {
			cls: "fileclass-color-circle is-custom",
			attr: { "aria-label": "Custom color…", title: "Custom color…" },
		});
		colorTrigger(custom, current, (v) => this.pick(v));
	}

	private pick(value: string): void {
		this.opts.onSubmit(value);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
