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
import { createNoteWithClass } from "../commands/createNoteWithClass";
import { Seed } from "../schema/newNote";
import { fileClassClaimingView } from "./baseSync";
import { fieldForView } from "./reverseView";
import { EditContext, runControlAction } from "../fields/fieldActions";
import { isInputSupported } from "../fields/support";
import { hasAllowedValues, validateField } from "../fields/validate";
import { resolveFieldValues } from "../fields/valuesIo";
import { makeDisplayDeps } from "../fields/displayDeps";
import { DisplayDeps, describeField } from "../fields/objectDisplay";
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
	/**
	 * The view type id, which the **embed** path reads and the leaf path does not.
	 *
	 * Measured by tracing every property the host asks of this object: in a leaf it reads
	 * `load`, `type`, `focus`, then sets `allProperties` and `data` and calls `onDataUpdated`.
	 * In an embed — a base code block, or a `![[Some.base]]` embed — it reads `type` and stops
	 * there: no data, no `onDataUpdated`, "0 results" in the toolbar over an empty view, while
	 * the native `table` type in the very same block rendered its rows. The native view carries
	 * a `type` field; this one did not, so `undefined` never matched the configured type.
	 */
	readonly type = FILECLASS_TABLE_VIEW;

	/** Set by the controller before `onDataUpdated()`. */
	data?: BasesDatasetLike;

	/** Per-render display deps, keyed by note path (#156). Cleared on every render. */
	private readonly deps = new Map<string, DisplayDeps>();
	/** Our item in the base's toolbar, and the class it acts on (undefined = ask). */
	private toolbarItem?: HTMLElement;
	private toolbarClass?: string;
	/** The "New <Class>" item beside it, and the class it creates (#84). */
	private newItem?: HTMLElement;
	private newClass?: string;
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

	/**
	 * An **embedded** base never asked its query to run.
	 *
	 * Measured: a `fileclass-table` in a ```base block, or a `![[Some.base]]` embed, stayed at
	 * "0 results" with an empty view, while the native `table` type in the very same block
	 * showed its rows — so it was not the filter, the file or the registration. The leaf path
	 * runs the first query itself; the embed path leaves it to the view, and this one was
	 * throwing the controller away (`_controller`) and could not ask.
	 *
	 * Guarded on there being no results yet, so the leaf path — where the scan has already run
	 * or is about to — is not made to run it twice.
	 */
	/**
	 * Fills the container before there is anything to show, which is what lets an **embedded**
	 * base run its query at all.
	 *
	 * Obsidian hides an embedded view whose container is empty —
	 * `.block-language-base .bases-view:empty { display: none }` — and the Bases controller
	 * suspends `runQuery` until that container `isShown()`. A view that renders nothing until
	 * its data arrives therefore waits for data that waits for it: measured, an embedded
	 * `fileclass-table` sat at "0 results" with `display: none` on its container, while the
	 * native type — which builds its table skeleton up front — showed its rows in the same
	 * block. One child element is enough to break the circle.
	 */
	onload(): void {
		this.placeholder();
	}

	/** The only data hook: render whatever the controller put on `this.data`. */
	onDataUpdated(): void {
		this.render();
	}

	onunload(): void {
		this.containerEl.empty();
		this.toolbarItem?.remove();
		this.toolbarItem = undefined;
		this.newItem?.remove();
		this.newItem = undefined;
	}

	// Lifecycle stubs the controller may call.
	focus(): void {}
	onResize(): void {}
	setEphemeralState(): void {}
	getEphemeralState(): Record<string, unknown> {
		return {};
	}

	/** Never leave the container `:empty` — see `onload`. */
	private placeholder(): void {
		this.containerEl.empty();
		this.containerEl.createDiv({ cls: "fileclass-table-pending" });
	}

	private render(): void {
		const ds = this.data;
		if (!ds || !ds.properties?.length) return this.placeholder();
		this.containerEl.empty();
		// A note's fields may have changed since the last render, and so may its groups' templates.
		this.deps.clear();

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

	/**
	 * Which base file and view this render belongs to.
	 *
	 * Two homes, because there are two ways to render a base. A leaf states it outright
	 * (`getViewState().state` is `{file, viewName}`). An **embed** has no leaf: it states it on
	 * the element that holds it — `![[Books.base#Book]]` leaves `src="Books.base#Book"` on the
	 * `.internal-embed`. Without that, an embedded table could not tell which class declared it
	 * and fell back to asking its rows: on `Books.base#Book` the wrench read *Manage fileClass*,
	 * because one of the nine rows is a Book **and** an Article.
	 *
	 * `![[Books.base]]` carries no view in its `src`, and then the rendered view is whichever
	 * one the toolbar names — the base's first, or another the reader switched to.
	 */
	private viewIdentity(): { file: string; viewName: string } | undefined {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("bases")) {
			if (!leaf.view.containerEl.contains(this.containerEl)) continue;
			const state = leaf.getViewState().state as { file?: string; viewName?: string } | undefined;
			if (state?.file && state.viewName) return { file: state.file, viewName: state.viewName };
		}

		const src = this.containerEl.closest<HTMLElement>("[src]")?.getAttribute("src");
		if (!src) return undefined;
		const hash = src.indexOf("#");
		const linkpath = hash < 0 ? src : src.slice(0, hash);
		const subpath = hash < 0 ? "" : src.slice(hash + 1);
		// A `src` is a link, not a path: `![[Books#Book]]` is legal and resolves by name.
		const resolved = this.plugin.app.metadataCache.getFirstLinkpathDest(
			linkpath,
			this.plugin.app.workspace.getActiveFile()?.path ?? ""
		);
		const viewName = subpath || this.toolbarViewName();
		if (!viewName) return undefined;
		return { file: resolved?.path ?? linkpath, viewName };
	}

	/**
	 * "New Book", beside the wrench — the note this table cannot show because it does not exist yet.
	 *
	 * Only when the table is about **one** class: with several, there is nothing to create without
	 * asking, and the command in the palette is where that question belongs.
	 *
	 * On a reverse-relation view read from an author's note it becomes "New Book with Frank Herbert"
	 * and seeds the field the view filters on (#154 + #84): the row you are about to write already
	 * has one value decided, and it is the one the table is about.
	 */
	private syncNewButton(toolbar: HTMLElement, only: string | undefined): void {
		if (!only) {
			this.newItem?.remove();
			this.newItem = undefined;
			return;
		}
		const seed = this.seedFor(only);
		const label = seed ? seed.label : `New ${only}`;

		if (!this.newItem?.isConnected) {
			this.newItem?.remove();
			const item = toolbar.createDiv({ cls: "bases-toolbar-item fileclass-toolbar-new" });
			const button = item.createDiv({ cls: "text-icon-button" });
			button.tabIndex = 0;
			setIcon(button.createSpan({ cls: "text-button-icon" }), "file-plus-2");
			button.createSpan({ cls: "text-button-label" });
			const create = (e: Event): void => {
				e.preventDefault();
				const fileClass = this.newClass;
				if (fileClass) void createNoteWithClass(this.plugin, { fileClass, seed: this.seedFor(fileClass) });
			};
			button.addEventListener("click", create);
			button.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") create(e);
			});
			this.newItem = item;
		}
		this.newClass = only;
		const labelEl = this.newItem.querySelector(".text-button-label");
		if (labelEl?.textContent !== label) labelEl?.setText(label);
		this.newItem.setAttribute(
			"aria-label",
			seed
				? `Fileclass: create a ${only} already linked to ${seed.label.replace(/^.*?with /, "")}`
				: `Fileclass: create a note with the ${only} class`
		);
	}

	/**
	 * The value a new row would already have, when this table is a reverse relation.
	 *
	 * The view's name is this plugin's own convention, so it is inverted rather than parsed; the host
	 * is the note whose editor holds this embed, found by containment rather than by "the active
	 * file", which is a different note as soon as there are two panes.
	 */
	private seedFor(fileClass: string): Seed | undefined {
		const claimed = this.viewIdentity();
		if (!claimed) return undefined;
		// The class says which of its fields this view reads backwards; its name is never consulted,
		// so a view called `A's Bs` seeds exactly as one called `Book by author` does.
		const declared = this.plugin.index.getFileClass(fileClass)?.options.relatedViews ?? [];
		const field = fieldForView(declared, claimed.file, claimed.viewName);
		if (!field) return undefined;
		const host = this.hostNote();
		if (!host) return undefined;
		return { field, linkTo: host.path, label: `New ${fileClass} with ${host.basename}` };
	}

	/** The note holding this embed, if this table is embedded in one. */
	private hostNote(): TFile | null {
		let found: TFile | null = null;
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view as { file?: TFile; containerEl?: HTMLElement };
			if (found || !view?.file || !view.containerEl) return;
			if (view.containerEl.contains(this.containerEl)) found = view.file;
		});
		return found;
	}

	/** The view the toolbar of this render says it is showing. */
	private toolbarViewName(): string | undefined {
		const scope = this.containerEl.closest(".bases-embed, .block-language-base, .view-content");
		const label = scope?.querySelector(".bases-toolbar-views-menu .text-button-label");
		return label?.textContent?.trim() || undefined;
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
		// The embed's own wrapper first, and only then the leaf: a note holding two embedded
		// bases has two toolbars, and looking from `.view-content` found the other one's.
		const scope = this.containerEl.closest(".bases-embed, .block-language-base, .view-content");
		const toolbar = scope?.querySelector<HTMLElement>(".bases-toolbar");
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
		this.syncNewButton(toolbar, only);
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
			const raw = this.displayText(entry, col, field);
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

	/**
	 * The text a cell shows.
	 *
	 * For an `Object` or `ObjectList`, the field's **own** display (#156): `describeField` applies
	 * the `displayTemplate`, recurses into a nested group and formats a `{{released|YYYY}}` child,
	 * which is what every other Fileclass surface shows for the same value — the note-fields modal,
	 * the property buttons, the API. Bases' `toString()` yields the stored JSON instead, and for a
	 * nested group a doubly-escaped version of it, so the cell read worse than the native table's
	 * while sitting next to an editor that speaks in `Study · C-4`.
	 *
	 * Every other type keeps Bases' value: it is the one that knows about formulas, file properties
	 * and its own link rendering.
	 */
	private displayText(entry: BasesEntryLike, col: string, field?: Field): string {
		if (field && (field.type === "Object" || field.type === "ObjectList")) {
			const raw = readFieldValue(this.plugin.app, entry.file, field);
			return describeField(field, raw, this.displayDeps(entry.file));
		}
		return this.cellText(entry, col);
	}

	/** Display deps for a note, built once per render — a group's display needs its whole field set. */
	private displayDeps(file: TFile): DisplayDeps {
		const cached = this.deps.get(file.path);
		if (cached) return cached;
		const deps = makeDisplayDeps(this.plugin.index.getFields(file));
		this.deps.set(file.path, deps);
		return deps;
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
		// Not `table`, which is the native view's: in the view switcher the two sat side by side
		// under the same glyph, and the only way to tell which one a base was using was to open it.
		// This keeps the table silhouette — it is still a table — and marks it as the one a schema
		// drives.
		icon: "table-config",
		factory: (_controller: unknown, containerEl: HTMLElement) =>
			new FileclassTableView(plugin, containerEl),
	});
}
