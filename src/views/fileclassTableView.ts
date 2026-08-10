/*
 * fileclass-table — a custom Bases view with editable cells (ARCHITECTURE.md
 * §11). Registered on the Bases plugin through the adapter (D4). Rather than
 * reproducing the native table's virtualization, it renders its own table from
 * the dataset the controller hands it (`view.data`, populated then followed by
 * `onDataUpdated()` — the only data hook, verified in the recon) and makes
 * `note.<field>` cells editable through the P2 dispatcher (updateField).
 *
 * The controller also calls focus / on(get)EphemeralState / onResize — provided
 * as safe stubs. Everything else in the base (query, filters, other views) stays
 * native.
 */
import { Component, TFile, setIcon } from "obsidian";

import type FileclassPlugin from "../../main";
import { registerFileclassView } from "../engine/basesAdapter";
import { fileClassClaimingView } from "./baseSync";
import { EditContext, runControlAction } from "../fields/fieldActions";
import { isInputSupported } from "../fields/support";
import { hasAllowedValues, validateField } from "../fields/validate";
import { resolveFieldValues } from "../fields/valuesIo";
import { readFieldValue } from "../io/read";
import { openFileClassSchema } from "../ui/fileClassSchemaModal";
import { makeValuePreview } from "../ui/valuePreview";
import { Field, isRootField } from "../schema/field";
import {
	columnLabel,
	fieldNameOfColumn,
	FILECLASS_TABLE_VIEW,
	parseCellSegments,
} from "./columns";

/** Minimal shape of the Bases dataset we consume (structural, like the adapter). */
interface BasesValueLike {
	toString(): string;
}
interface BasesEntryLike {
	file: TFile;
	getValue(id: string): BasesValueLike | null;
}
interface BasesDatasetLike {
	properties: string[];
	data: BasesEntryLike[];
}

class FileclassTableView extends Component {
	/** Set by the controller before `onDataUpdated()`. */
	data?: BasesDatasetLike;
	/** Our item in the base's toolbar, and the class it acts on (undefined = ask). */
	private toolbarItem?: HTMLElement;
	private toolbarClass?: string;
	/**
	 * Which rows the `valid` column is showing (#142).
	 *
	 * Bases lets a plugin register a **view** and nothing else — no computed property, no
	 * function (`registrations` holds view types only, measured). So validity cannot be a
	 * property its Sort and Filter menus see, and expressing it as a base formula would mean
	 * re-stating in Bases' language a check that resolves allowed values through queries: two
	 * answers to one question, drifting apart. The column filters itself instead, which is
	 * exact, and lives for the session rather than being written into someone's base file.
	 */
	private validFilter: "all" | "invalid" | "valid" = "all";
	allProperties?: unknown;
	config?: unknown;

	constructor(
		private readonly plugin: FileclassPlugin,
		private readonly containerEl: HTMLElement
	) {
		super();
	}

	/** The only data hook: render whatever the controller put on `this.data`. */
	onDataUpdated(): void {
		this.render();
	}

	onunload(): void {
		this.containerEl.empty();
		this.toolbarItem?.remove();
		this.toolbarItem = undefined;
	}

	// Lifecycle stubs the controller may call.
	focus(): void {}
	onResize(): void {}
	setEphemeralState(): void {}
	getEphemeralState(): Record<string, unknown> {
		return {};
	}

	private render(): void {
		const ds = this.data;
		this.containerEl.empty();
		if (!ds || !ds.properties?.length) return;

		const showValidation = this.plugin.settings.enableValidationColumns;
		const table = this.containerEl.createEl("table", { cls: "fileclass-table" });
		const headRow = table.createEl("thead").createEl("tr");
		if (showValidation) this.renderValidHeader(headRow);
		for (const col of ds.properties) headRow.createEl("th", { text: columnLabel(col) });
		if (showValidation) headRow.createEl("th", { text: "errors", cls: "fc-errors-col" });

		const body = table.createEl("tbody");
		// Allowed values are per-field, not per-note — resolve once per render.
		const allowedCache = new Map<string, Promise<string[]>>();
		for (const entry of ds.data) {
			const row = body.createEl("tr");
			const validCell = showValidation ? row.createEl("td", { cls: "fc-valid-col" }) : undefined;
			for (const col of ds.properties) this.renderCell(row, entry, col);
			if (showValidation && validCell) {
				const errCell = row.createEl("td", { cls: "fc-errors-col" });
				void this.fillValidation(entry.file, validCell, errCell, allowedCache);
			}
		}
		this.syncToolbarButton(ds);
	}

	/** Which base file and view this render belongs to, from the leaf that holds it. */
	private viewIdentity(): { file: string; viewName: string } | undefined {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("bases")) {
			if (!leaf.view.containerEl.contains(this.containerEl)) continue;
			const state = leaf.getViewState().state as { file?: string; viewName?: string } | undefined;
			if (state?.file && state.viewName) return { file: state.file, viewName: state.viewName };
		}
		return undefined;
	}

	/**
	 * A wrench in the base's own toolbar: the schema of the class this table is about.
	 *
	 * A table is where a schema shows its consequences — a column too many, a type that reads
	 * wrong in every row — and the fix was three clicks away in the file explorer. The class is
	 * read off the rows rather than the view's name, which is only the class's by convention:
	 * one class among them names it, several open the picker, none hides the button.
	 *
	 * The toolbar belongs to the base, not to this view, so the item is created once and
	 * removed in `onunload` — which is when switching to a native view unloads this one.
	 */
	private syncToolbarButton(ds: BasesDatasetLike): void {
		const toolbar = this.containerEl
			.closest(".view-content")
			?.querySelector<HTMLElement>(".bases-toolbar");
		if (!toolbar) return;

		// The class that *declared* this view, first: `Books.base > Book` is Book's view, and a
		// row that is both a Book and an Article does not make it ambiguous. Only a view nobody
		// claims — one written by hand — falls back to asking the rows.
		const claimed = this.viewIdentity();
		const owner = claimed && fileClassClaimingView(this.plugin, claimed.file, claimed.viewName);
		const classes = new Set<string>(owner ? [owner] : []);
		if (!owner) {
			for (const entry of ds.data) {
				for (const name of this.plugin.index.getFileClasses(entry.file)) classes.add(name);
			}
		}
		if (!classes.size) {
			this.toolbarItem?.remove();
			this.toolbarItem = undefined;
			return;
		}
		const only = classes.size === 1 ? [...classes][0] : undefined;
		const label = only ? `Manage ${only}` : "Manage fileClass";

		if (!this.toolbarItem?.isConnected) {
			this.toolbarItem?.remove();
			const item = toolbar.createDiv({ cls: "bases-toolbar-item fileclass-toolbar-manage" });
			const button = item.createDiv({ cls: "text-icon-button" });
			button.tabIndex = 0;
			setIcon(button.createSpan({ cls: "text-button-icon" }), "wrench");
			button.createSpan({ cls: "text-button-label" });
			const open = (e: Event): void => {
				e.preventDefault();
				openFileClassSchema(this.plugin, this.toolbarClass);
			};
			button.addEventListener("click", open);
			button.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") open(e);
			});
			this.toolbarItem = item;
		}
		this.toolbarClass = only;
		const labelEl = this.toolbarItem.querySelector(".text-button-label");
		if (labelEl?.textContent !== label) labelEl?.setText(label);
		this.toolbarItem.setAttribute(
			"aria-label",
			only
				? `Fileclass: open ${only}'s schema`
				: "Fileclass: open the schema of one of the classes in this table"
		);
	}

	/** Validates a note's fields (all root fields, not just shown columns) and
	 * fills the computed valid/errors cells. Async: allowed values may hit Bases. */
	private async fillValidation(
		file: TFile,
		validCell: HTMLElement,
		errCell: HTMLElement,
		cache: Map<string, Promise<string[]>>
	): Promise<void> {
		const errors: string[] = [];
		for (const f of this.plugin.index.getFields(file).filter(isRootField)) {
			let allowed: string[] = [];
			if (hasAllowedValues(f.type)) {
				let pending = cache.get(f.id);
				if (!pending) {
					pending = resolveFieldValues(this.plugin, f, file).catch(() => []);
					cache.set(f.id, pending);
				}
				allowed = await pending;
			}
			const result = validateField(f, readFieldValue(this.plugin.app, file, f), allowed);
			if (!result.ok) errors.push(result.message ?? `"${f.name}" is invalid`);
		}
		if (!validCell.isConnected) return; // re-rendered while awaiting
		if (errors.length) {
			validCell.setText("✗");
			validCell.addClass("fc-invalid");
			errCell.setText(errors.join("; "));
			errCell.setAttribute("title", errors.join("\n"));
		} else {
			validCell.setText("✓");
			validCell.addClass("fc-ok");
		}
		// Validation is per row and asynchronous, so the filter is applied again on every
		// answer rather than once at the end — there is no "end" to wait for.
		const row = validCell.closest("tr");
		if (row instanceof HTMLElement) row.dataset.fcValid = errors.length ? "0" : "1";
		this.applyValidFilter();
	}

	/**
	 * The `valid` header, which is also the control that filters on it (#142): click to see
	 * only the rows that need attention, click again for the ones that don't, once more for
	 * everything. The count of failures rides along, since "how many" is the other half of the
	 * question and it is already computed.
	 */
	private renderValidHeader(headRow: HTMLElement): void {
		const th = headRow.createEl("th", { cls: "fc-valid-col fc-valid-header" });
		th.tabIndex = 0;
		const label = th.createSpan({ text: "valid" });
		th.createSpan({ cls: "fc-valid-count" });
		const cycle = (e: Event): void => {
			e.preventDefault();
			this.validFilter =
				this.validFilter === "all" ? "invalid" : this.validFilter === "invalid" ? "valid" : "all";
			this.applyValidFilter();
		};
		th.addEventListener("click", cycle);
		th.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") cycle(e);
		});
		label.setText("valid");
	}

	/** Hides what the current mode excludes, and says what it is doing in the header. */
	private applyValidFilter(): void {
		const table = this.containerEl.querySelector("table.fileclass-table");
		if (!table) return;
		const rows = Array.from(table.querySelectorAll<HTMLElement>("tbody tr"));
		let invalid = 0;
		for (const row of rows) {
			const state = row.dataset.fcValid;
			if (state === "0") invalid++;
			// A row still being validated is shown: hiding it and putting it back would make
			// the table flicker on every open.
			const hide =
				(this.validFilter === "invalid" && state === "1") ||
				(this.validFilter === "valid" && state === "0");
			row.toggleClass("fc-row-filtered", hide);
		}
		const th = table.querySelector<HTMLElement>("th.fc-valid-header");
		if (!th) return;
		const count = th.querySelector<HTMLElement>(".fc-valid-count");
		count?.setText(invalid ? ` ${invalid}✗` : "");
		th.toggleClass("is-filtering", this.validFilter !== "all");
		th.setAttribute(
			"aria-label",
			this.validFilter === "all"
				? `Fileclass: ${invalid || "no"} row${invalid === 1 ? "" : "s"} with something to fix — click to show only those`
				: this.validFilter === "invalid"
					? "Fileclass: showing only rows with something to fix — click for the rest"
					: "Fileclass: showing only rows with nothing to fix — click to show all"
		);
	}

	private renderCell(row: HTMLElement, entry: BasesEntryLike, col: string): void {
		const cell = row.createEl("td");
		// Flex wrapper: content truncates, an injected indicator stays pinned.
		const content = cell.createDiv({ cls: "fc-cell" });
		const source = entry.file.path;
		const field = this.editableField(entry.file, col);

		if (col === "file.name") {
			// Like the standard first column: a link to the note.
			this.renderInternalLink(content, entry.file.path, entry.file.basename, source);
		} else {
			const raw = this.cellText(entry, col);
			// A type preview (Color swatch / Icon glyph / image) leads the value.
			if (field) {
				const preview = makeValuePreview(field, raw, {
					app: this.plugin.app,
					sourcePath: entry.file.path,
					raw: readFieldValue(this.plugin.app, entry.file, field),
				});
				if (preview) content.prepend(preview);
			}
			for (const seg of parseCellSegments(raw)) {
				if ("link" in seg) this.renderInternalLink(content, seg.link, seg.display, source);
				else content.createSpan({ cls: "fc-seg", text: seg.text });
			}
		}

		// Full value on hover, since cells are truncated with an ellipsis.
		const full = content.textContent ?? "";
		if (full) cell.setAttribute("title", full);

		if (!field) return;
		cell.addClass("fileclass-editable");
		cell.addEventListener("click", (e) => {
			e.stopPropagation();
			this.editCell(entry.file, field, e.altKey);
		});
	}

	private cellText(entry: BasesEntryLike, col: string): string {
		try {
			const v = entry.getValue(col);
			const text = v == null ? "" : v.toString();
			return text === "null" ? "" : text;
		} catch {
			return "";
		}
	}

	/** A clickable internal link (navigates; stops the cell's edit handler). */
	private renderInternalLink(
		cell: HTMLElement,
		linktext: string,
		display: string,
		sourcePath: string
	): void {
		const a = cell.createEl("a", { cls: "internal-link", text: display });
		a.setAttribute("data-href", linktext);
		a.setAttribute("href", linktext);
		a.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			void this.plugin.app.workspace.openLinkText(linktext, sourcePath, e.ctrlKey || e.metaKey);
		});
	}

	/** The editable fileClass field behind a `note.<field>` column, if any. */
	private editableField(file: TFile, col: string): Field | undefined {
		const name = fieldNameOfColumn(col);
		if (!name) return undefined;
		return this.plugin.index
			.getFields(file)
			.find((f) => f.name === name && isRootField(f) && isInputSupported(f.type));
	}

	private editCell(file: TFile, field: Field, alt = false): void {
		const ctx: EditContext = {
			host: this.plugin,
			file,
			allFields: this.plugin.index.getFields(file),
		};
		// The gesture is the type's, the same one the Properties buttons and the
		// note-fields modal perform (controlAction.ts); Alt-click opens the input.
		// Writes via processFrontMatter → Bases re-runs the query → onDataUpdated.
		void runControlAction(ctx, field, { alt });
	}
}

/**
 * Registers the `fileclass-table` view on the Bases plugin. Returns an
 * unregister function (call on unload). Throws BasesUnavailableError when Bases
 * is missing — callers feature-detect first.
 */
export function registerFileclassTableView(plugin: FileclassPlugin): () => void {
	return registerFileclassView(plugin.app, FILECLASS_TABLE_VIEW, {
		name: "Fileclass table",
		icon: "table",
		factory: (_controller: unknown, containerEl: HTMLElement) =>
			new FileclassTableView(plugin, containerEl),
	});
}
