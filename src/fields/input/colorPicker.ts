/*
 * Color picker (#33). Mirrors the Obsidian canvas color picker UI: one row of
 * circular swatches — "no color", the palette colors, and a rainbow "custom"
 * circle that opens the native color dialog (via a hidden <input type="color">
 * triggered by .click(), so the theme-styled native control is never rendered).
 * The palette comes from an extensible source registry; storage is a raw CSS
 * color scalar (the palette is a picker concern, not a storage one).
 */
import { App, Modal } from "obsidian";

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

export class ColorPickerModal extends Modal {
	constructor(app: App, private readonly opts: ColorPickerOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });
		const source = colorSourceById(this.opts.source);
		const current = this.opts.initial.trim().toLowerCase();

		const row = contentEl.createDiv({ cls: "fileclass-color-circles" });

		// "No color" (clear).
		const clear = row.createEl("button", {
			cls: "fileclass-color-circle is-clear",
			attr: { "aria-label": "No color", title: "No color" },
		});
		if (!current) clear.addClass("is-selected");
		clear.onclick = () => this.pick("");

		// Palette colors.
		for (const s of source.swatches) {
			const circle = row.createEl("button", {
				cls: "fileclass-color-circle",
				attr: { "aria-label": `${s.label} (${s.value})`, title: `${s.label} (${s.value})` },
			});
			circle.setCssStyles({ backgroundColor: s.value });
			if (s.value.toLowerCase() === current) circle.addClass("is-selected");
			circle.onclick = () => this.pick(s.value);
		}

		// Custom color: a rainbow circle opening the native color dialog. The
		// native input is kept hidden (never theme-styled) and triggered via click.
		const native = contentEl.createEl("input", {
			cls: "fileclass-color-hidden",
			attr: { type: "color" },
		});
		native.value = HEX6_RE.test(current) ? current : "#000000";
		native.addEventListener("change", () => this.pick(native.value));

		const custom = row.createEl("button", {
			cls: "fileclass-color-circle is-custom",
			attr: { "aria-label": "Custom color…", title: "Custom color…" },
		});
		const inPalette = source.swatches.some((s) => s.value.toLowerCase() === current);
		if (current && !inPalette) custom.addClass("is-selected");
		custom.onclick = () => native.click();
	}

	private pick(value: string): void {
		this.opts.onSubmit(value);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
