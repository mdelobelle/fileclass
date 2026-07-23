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
import { Component, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { registerFileclassView } from "../engine/basesAdapter";
import { EditContext, updateField } from "../fields/fieldActions";
import { isInputSupported } from "../fields/support";
import { hasAllowedValues, validateField } from "../fields/validate";
import { resolveFieldValues } from "../fields/valuesIo";
import { readFieldValue } from "../io/read";
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
		if (showValidation) headRow.createEl("th", { text: "valid", cls: "fc-valid-col" });
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
			// A type preview (Color swatch / Icon glyph) leads the value, if any.
			if (field) {
				const preview = makeValuePreview(field, raw);
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
			this.editCell(entry.file, field);
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

	private editCell(file: TFile, field: Field): void {
		const ctx: EditContext = {
			host: this.plugin,
			file,
			allFields: this.plugin.index.getFields(file),
		};
		// Writes via processFrontMatter → Bases re-runs the query → onDataUpdated.
		void updateField(ctx, field);
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
