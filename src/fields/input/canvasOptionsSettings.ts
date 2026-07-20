/*
 * Schema-editor settings for the Canvas field family (ARCHITECTURE.md §9.1).
 * Ports Metadata Menu's canvas filters — edge/node colors, edge sides, edge
 * labels, group colors/labels — as conjunctive (AND) filters. MDM's DataviewJS
 * "matching files" is replaced by a `.base` view (D1), like File/Media fields.
 */
import { App, Setting, setIcon } from "obsidian";

import { FieldType } from "../../schema/field";
import { BaseFileSuggest, BaseViewSuggest, CanvasFileSuggest } from "../../ui/baseSuggest";
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

function colorSelect(container: HTMLElement, name: string, draft: OptionsDraft, key: ArrayKey): void {
	const setting = new Setting(container).setName(name).setDesc("None selected = any.");
	for (const c of CANVAS_COLORS) {
		const chip = setting.controlEl.createEl("button", { cls: "fileclass-color-chip" });
		if (c.id === "0") chip.addClass("fileclass-color-none");
		else chip.setCssStyles({ backgroundColor: c.color });
		chip.setAttribute("aria-label", c.label);
		const sync = () => chip.toggleClass("is-selected", get(draft, key).includes(c.id));
		sync();
		chip.addEventListener("click", (e) => {
			e.preventDefault();
			toggle(draft, key, c.id);
			sync();
		});
	}
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
		colorSelect(container, "Group matching colors", draft, "groupColors");
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
		colorSelect(container, "Edge matching colors", draft, "edgeColors");
		sideSelect(container, "Edge from side", draft, "edgeFromSides");
		sideSelect(container, "Edge to side", draft, "edgeToSides");
		labelList(container, "Edge matching labels", draft, "edgeLabels");
		colorSelect(container, "Node matching colors", draft, "nodeColors");
	}

	if (hasLinks) matchingFiles(container, draft, app);
}
