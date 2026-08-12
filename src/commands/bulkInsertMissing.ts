/*
 * Inserting a class's missing fields across the notes that carry it.
 *
 * *Insert missing fields* has always been a per-note command, which is fine on the note you
 * are looking at and useless the day a class gains a field: the notes written before it keep
 * a gap nobody can see, and closing it meant opening every one of them. Bulk **edit** could
 * set a value everywhere, but not add the key in the first place — the one operation the
 * schema change actually calls for.
 *
 * Same shape as the rename migration and the bulk edit: count, list, confirm, then write.
 * Nothing here writes before the answer.
 */
import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { logEvent } from "../log/schemaLog";

import type FileclassPlugin from "../../main";
import { missingRootFields } from "../fields/missingFields";
import { hasFieldKey } from "../io/read";
import { insertMissingFields } from "./insertMissingFields";
import { makeStickyFooter } from "../ui/modalFooter";
import { modalTitle } from "../ui/modalTitle";

export interface InsertCandidate {
	file: TFile;
	/** The fields this note is missing, by name — what the list shows. */
	missing: string[];
}

/**
 * The notes bound to `fileClassName` that are missing at least one of its root fields.
 *
 * Bound, not "declaring": a note claimed by a folder or a tag is as much a member of the class
 * as one that names it, and it is likelier to be the one nobody thought of.
 */
export function notesMissingFields(
	plugin: FileclassPlugin,
	fileClassName: string
): InsertCandidate[] {
	const out: InsertCandidate[] = [];
	for (const file of plugin.app.vault.getMarkdownFiles()) {
		if (!plugin.index.getFileClasses(file).includes(fileClassName)) continue;
		const fields = plugin.index.getFields(file);
		const missing = missingRootFields(fields, (f) => hasFieldKey(plugin.app, file, f));
		if (missing.length) out.push({ file, missing: missing.map((f) => f.name) });
	}
	return out;
}

/** Asks, lists, and inserts. A class whose notes are all complete says so and stops. */
export async function bulkInsertMissingFields(
	plugin: FileclassPlugin,
	fileClassName: string
): Promise<void> {
	const candidates = notesMissingFields(plugin, fileClassName);
	if (!candidates.length) {
		new Notice(`Fileclass: every note of "${fileClassName}" already has its fields.`);
		return;
	}
	const confirmed = await new Promise<boolean>((resolve) => {
		new InsertPreviewModal(plugin.app, { fileClassName, candidates, resolve }).open();
	});
	if (!confirmed) return;

	let written = 0;
	for (const { file } of candidates) {
		// Recomputed per note, and silent: the summary below is the one message worth showing.
		written += await insertMissingFields(plugin.app, file, plugin.index.getFields(file), {
			quiet: true,
			reorder: false,
		});
	}
	new Notice(
		`Fileclass: inserted ${written} field(s) across ${candidates.length} note(s) of "${fileClassName}".`
	);
	// A write across notes nobody had open: the log's INFO is exactly for this.
	void logEvent(
		plugin,
		"INFO",
		"schema.fields-inserted",
		`${fileClassName}: inserted ${written} field(s) across ${candidates.length} note(s)`,
		{ fileClass: fileClassName, fields: written, notes: candidates.length }
	);
}

interface PreviewOptions {
	fileClassName: string;
	candidates: InsertCandidate[];
	resolve: (confirmed: boolean) => void;
}

class InsertPreviewModal extends Modal {
	private answered = false;

	constructor(app: App, private readonly opts: PreviewOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const { fileClassName, candidates } = this.opts;
		modalTitle(contentEl, `Insert missing fields — ${fileClassName}`);

		const total = candidates.reduce((n, c) => n + c.missing.length, 0);
		contentEl.createEl("p", {
			text:
				`${candidates.length} note(s) are missing ${total} field(s) in all. ` +
				"They arrive empty: a key with nothing in it, which is what a required field then flags.",
		});

		const list = contentEl.createDiv({ cls: "fileclass-setting-list" });
		for (const { file, missing } of candidates) {
			new Setting(list)
				.setName(file.path)
				.setDesc(missing.length > 4 ? `${missing.length} fields` : missing.join(", "));
		}

		const footer = makeStickyFooter(contentEl);
		new Setting(footer)
			.addButton((b) => b.setButtonText("Not now").onClick(() => this.answer(false)))
			.addButton((b) =>
				b
					.setButtonText(`Insert in ${candidates.length} note(s)`)
					.setCta()
					.onClick(() => this.answer(true))
			);
	}

	private answer(confirmed: boolean): void {
		this.answered = true;
		this.opts.resolve(confirmed);
		this.close();
	}

	onClose(): void {
		if (!this.answered) this.opts.resolve(false);
		this.contentEl.empty();
	}
}
