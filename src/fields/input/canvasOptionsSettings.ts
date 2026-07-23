/*
 * Schema-editor settings for the Canvas field family (ARCHITECTURE.md §9.1).
 * Ports Metadata Menu's canvas filters — edge/node colors, edge sides, edge
 * labels, group colors/labels — as conjunctive (AND) filters. MDM's DataviewJS
 * "matching files" is replaced by a `.base` view (D1), like File/Media fields.
 */
import { App, Setting, setIcon } from "obsidian";

import { FieldType } from "../../schema/field";
import { BaseFileSuggest, BaseViewSuggest, CanvasFileSuggest } from "../../ui/baseSuggest";
import { parseCanvas } from "../canvas/canvasGraph";
import { customColors } from "../customPalette";
import { OptionsDraft } from "../optionsDraft";

type ArrayKey = "edgeColors" | "edgeFromSides" | "edgeToSides" | "edgeLabels" | "nodeColors" | "groupColors" | "groupLabels";

const CANVAS_COLORS: { id: string; label: string; color: string }[] = [
	{ id: "0", label: "No color", color: "transparent" },
	{ id: "1", label: "Red", color: "#fb464c" },
	{ id: "2", label: "Orange", color: "#ec7500" },
	{ id: "3", label: "Yellow", color: "#e0ac00" },
	{ id: "4", label: "Green", color: "#08b94e" },
	{ id: "5", label: "Cyan", color: "#00b7d3" },
	{ id: "6", label: "Purple", color: "#7852ee" },
];
const SIDES: { id: string; icon: string }[] = [
	{ id: "top", icon: "chevron-up" },
	{ id: "right", icon: "chevron-right" },
	{ id: "bottom", icon: "chevron-down" },
	{ id: "left", icon: "chevron-left" },
];

function get(draft: OptionsDraft, key: ArrayKey): string[] {
	return draft[key] ?? [];
}
function put(draft: OptionsDraft, key: ArrayKey, arr: string[]): void {
	draft[key] = arr.length ? arr : undefined;
}
function toggle(draft: OptionsDraft, key: ArrayKey, id: string): void {
	const arr = get(draft, key);
	put(draft, key, arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
}

/** A canvas color value is a preset index ("0".."6") or a custom CSS value. */
function isCustomColor(value: string): boolean {
	return !/^[0-6]$/u.test(value);
}

/** Collects distinct custom colors used in a `.canvas` file (async, best-effort). */
async function loadCanvasColors(
	app: App,
	path: string | undefined,
	into: string[],
	onLoaded: () => void
): Promise<void> {
	if (!path) return;
	const file = app.vault.getFileByPath(path);
	if (!file) return;
	try {
		const data = parseCanvas(await app.vault.read(file));
		const seen = new Set(into);
		for (const item of [...data.nodes, ...data.edges]) {
			const c = item.color;
			if (c && isCustomColor(c) && !seen.has(c)) {
				seen.add(c);
				into.push(c);
			}
		}
		if (into.length) onLoaded();
	} catch {
		/* unreadable/invalid canvas — offer presets + saved colors only */
	}
}

/**
 * A multi-select of colors: the 6 canvas presets, plus custom colors (saved
 * palette + those present in the referenced `.canvas`) and a "+" for an
 * arbitrary one. Presets toggle their index; custom colors toggle their CSS
 * value — `colorMatch` compares the raw stored value either way (#43).
 */
function colorSelect(
	container: HTMLElement,
	name: string,
	draft: OptionsDraft,
	key: ArrayKey,
	app: App
): void {
	const setting = new Setting(container).setName(name).setDesc("None selected = any.");
	const row = setting.controlEl.createDiv({ cls: "fileclass-color-circles" });
	const fileColors: string[] = [];

	const chip = (cls: string, label: string, bg: string | null, selected: boolean, onClick: () => void) => {
		const el = row.createEl("button", { cls: `fileclass-color-circle${cls}`, attr: { title: label, "aria-label": label } });
		if (bg) el.setCssStyles({ backgroundColor: bg });
		el.toggleClass("is-selected", selected);
		el.addEventListener("click", (e) => {
			e.preventDefault();
			onClick();
		});
		return el;
	};

	const render = () => {
		row.empty();
		const selected = get(draft, key);
		for (const c of CANVAS_COLORS) {
			chip(c.id === "0" ? " is-clear" : "", c.label, c.id === "0" ? null : c.color, selected.includes(c.id), () => {
				toggle(draft, key, c.id);
				render();
			});
		}
		const customs = new Set<string>([...customColors(), ...fileColors, ...selected.filter(isCustomColor)]);
		for (const hex of customs) {
			chip("", hex, hex, selected.includes(hex), () => {
				toggle(draft, key, hex);
				render();
			});
		}
		const add = row.createEl("label", {
			cls: "fileclass-color-circle is-add",
			attr: { title: "Add a color…", "aria-label": "Add a color…" },
		});
		setIcon(add, "plus");
		const input = add.createEl("input", { cls: "fileclass-color-hidden", attr: { type: "color" } });
		input.value = "#000000";
		input.addEventListener("change", () => {
			if (!get(draft, key).includes(input.value)) toggle(draft, key, input.value);
			render();
		});
	};
	render();
	void loadCanvasColors(app, draft.canvasPath, fileColors, render);
}

function sideSelect(container: HTMLElement, name: string, draft: OptionsDraft, key: ArrayKey): void {
	const setting = new Setting(container).setName(name).setDesc("None selected = any side.");
	for (const s of SIDES) {
		const chip = setting.controlEl.createEl("button", { cls: "fileclass-side-chip" });
		setIcon(chip, s.icon);
		chip.setAttribute("aria-label", s.id);
		const sync = () => chip.toggleClass("is-selected", get(draft, key).includes(s.id));
		sync();
		chip.addEventListener("click", (e) => {
			e.preventDefault();
			toggle(draft, key, s.id);
			sync();
		});
	}
}

function labelList(container: HTMLElement, name: string, draft: OptionsDraft, key: ArrayKey): void {
	const chips = container.createDiv({ cls: "fileclass-chip-list" });
	const render = () => {
		chips.empty();
		for (const label of get(draft, key)) {
			const chip = chips.createSpan({ cls: "fileclass-text-chip", text: label });
			const rm = chip.createSpan({ cls: "fileclass-text-chip-x" });
			setIcon(rm, "x");
			rm.addEventListener("click", () => {
				put(draft, key, get(draft, key).filter((x) => x !== label));
				render();
			});
		}
	};
	const setting = new Setting(container).setName(name).setDesc("Match any of these labels. Empty = any.");
	let input: HTMLInputElement;
	const add = () => {
		const v = input.value.trim();
		if (v && !get(draft, key).includes(v)) put(draft, key, [...get(draft, key), v]);
		input.value = "";
		render();
	};
	setting.addText((t) => {
		input = t.inputEl;
		t.setPlaceholder("label");
		t.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				add();
			}
		});
	});
	setting.addExtraButton((b) => b.setIcon("plus").setTooltip("Add label").onClick(add));
	render();
}

function matchingFiles(container: HTMLElement, draft: OptionsDraft, app: App): void {
	new Setting(container)
		.setName("Matching files (base)")
		.setDesc("Only link to notes returned by this .base view. Empty = any note.")
		.addText((t) => {
			t.setPlaceholder("Path/to/file.base").setValue(draft.baseFile ?? "").onChange((v) => (draft.baseFile = v));
			new BaseFileSuggest(app, t.inputEl);
		});
	new Setting(container)
		.setName("Matching files view")
		.addText((t) => {
			t.setPlaceholder("(default view)").setValue(draft.viewName ?? "").onChange((v) => (draft.viewName = v));
			new BaseViewSuggest(app, t.inputEl, () => draft.baseFile ?? "");
		});
}

/** Renders every Canvas-family setting for `type` into `container`. */
export function renderCanvasSettings(
	container: HTMLElement,
	type: FieldType,
	draft: OptionsDraft,
	app: App
): void {
	const hasEdges = type !== "CanvasGroup"; // Canvas, CanvasGroupLink follow edges
	const hasGroups = type !== "Canvas"; // CanvasGroup, CanvasGroupLink use groups
	const hasLinks = type !== "CanvasGroup"; // produce file links

	new Setting(container)
		.setName("Canvas file")
		.setDesc("Path of the .canvas file whose graph feeds this field.")
		.addText((t) => {
			t.setPlaceholder("Path/to/board.canvas").setValue(draft.canvasPath ?? "").onChange((v) => (draft.canvasPath = v));
			new CanvasFileSuggest(app, t.inputEl);
		});

	if (hasGroups) {
		colorSelect(container, "Group matching colors", draft, "groupColors", app);
		labelList(container, "Group matching labels", draft, "groupLabels");
	}

	if (hasEdges) {
		new Setting(container)
			.setName("Direction")
			.setDesc("Which edges to follow from this note.")
			.addDropdown((d) =>
				d
					.addOption("bothsides", "Both sides")
					.addOption("incoming", "Incoming")
					.addOption("outgoing", "Outgoing")
					.setValue(draft.canvasDirection ?? "bothsides")
					.onChange((v) => (draft.canvasDirection = v as typeof draft.canvasDirection))
			);
		colorSelect(container, "Edge matching colors", draft, "edgeColors", app);
		sideSelect(container, "Edge from side", draft, "edgeFromSides");
		sideSelect(container, "Edge to side", draft, "edgeToSides");
		labelList(container, "Edge matching labels", draft, "edgeLabels");
		colorSelect(container, "Node matching colors", draft, "nodeColors", app);
	}

	if (hasLinks) matchingFiles(container, draft, app);
}
