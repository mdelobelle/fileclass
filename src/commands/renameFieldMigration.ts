/*
 * Renaming a field is a data migration (#108).
 *
 * Renaming a definition used to rewrite the class note and nothing else: every note kept the
 * old key with its value, while the new name had nothing under it — the field read as empty
 * everywhere while its data sat one line above, under a name nothing knew about. Found while
 * recording take 020, where renaming `shelf` to `storage` left `shelf: Study · A-3` in three
 * books.
 *
 * So the rename asks first. This module finds the notes that actually carry the old key,
 * shows them, and rewrites them only on confirmation — one `processFrontMatter` per note,
 * order-preserving (`renameProperty`).
 */
import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { logEvent } from "../log/schemaLog";

import type FileclassPlugin from "../../main";
import { Field } from "../schema/field";
import { ancestorNames, renameProperty } from "../schema/renameProperty";
import { makeStickyFooter } from "../ui/modalFooter";
import { modalTitle } from "../ui/modalTitle";

/** A note that carries the old key, and how many times (an ObjectList carries one per item). */
export interface RenameCandidate {
	file: TFile;
	occurrences: number;
}

/**
 * Every note whose class declares `field` and whose frontmatter still carries `from`.
 *
 * The index answers "does this note have this field?" precisely — inheritance, tag, folder and
 * bookmark bindings included — which guessing from the class name never could.
 */
export function notesCarrying(plugin: FileclassPlugin, field: Field, from: string): RenameCandidate[] {
	const out: RenameCandidate[] = [];
	for (const file of plugin.app.vault.getMarkdownFiles()) {
		const fields = plugin.index.getFields(file);
		if (!fields.some((f) => f.id === field.id)) continue;
		const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) continue;
		// A dry run of the very write that would be applied: whatever it would rename is
		// exactly what this note has to migrate, nested groups and list items included.
		const { renamed } = renameProperty(frontmatter, ancestorNames(fields, field), from, field.name);
		if (renamed) out.push({ file, occurrences: renamed });
	}
	return out;
}

/**
 * Asks, lists, and migrates. Resolves once the notes are written, or immediately when there is
 * nothing to migrate — a rename that touches no note should not open a modal to say so.
 */
export async function migrateRenamedField(
	plugin: FileclassPlugin,
	field: Field,
	from: string
): Promise<void> {
	if (!from || from === field.name) return;
	const candidates = notesCarrying(plugin, field, from);
	if (!candidates.length) return;
	const bases = await basesMentioning(plugin, from);
	const confirmed = await new Promise<boolean>((resolve) => {
		new RenamePreviewModal(plugin.app, { from, to: field.name, candidates, bases, resolve }).open();
	});
	if (!confirmed) return;

	let written = 0;
	for (const { file } of candidates) {
		const fields = plugin.index.getFields(file);
		const ancestors = ancestorNames(fields, field);
		await plugin.app.fileManager.processFrontMatter(file, (fm) => {
			const result = renameProperty(fm, ancestors, from, field.name);
			if (!result.renamed) return;
			// The renamed object is a rebuild, so the callback's own object is refilled from it
			// — that is the only way the write keeps the key order the panel shows.
			const next = result.value as Record<string, unknown>;
			for (const key of Object.keys(fm as Record<string, unknown>)) {
				delete (fm as Record<string, unknown>)[key];
			}
			Object.assign(fm as Record<string, unknown>, next);
			written += result.renamed;
		});
	}
	new Notice(
		`Fileclass: renamed "${from}" to "${field.name}" in ${candidates.length} note(s)` +
			(written > candidates.length ? ` (${written} occurrences).` : ".")
	);
	// The widest write the plugin performs — a key changing name in notes you were not looking at.
	void logEvent(
		plugin,
		"INFO",
		"schema.field-renamed",
		`${field.fileClassName} › ${field.name}: renamed from "${from}" in ${candidates.length} note(s)`,
		{
			fileClass: field.fileClassName,
			field: field.name,
			from,
			notes: candidates.length,
			occurrences: written,
		}
	);
}

/**
 * The `.base` files whose text still mentions the old name.
 *
 * A base is **not** migrated: its views are the author's, written by hand, and rewriting
 * someone's queries because a field was renamed would be a much bigger promise than this
 * feature makes. But saying nothing turns a rename into a column that silently empties, so the
 * modal names the bases that will need a look. A plain text search, deliberately: a base names
 * properties in `order`, in `filters`, in `sort` and inside formulas, and a parser that
 * understood only some of those would miss exactly the ones nobody remembers.
 *
 * The cost of that bluntness is a false positive — renaming `Book.shelf` also names
 * `Comics.base`, which mentions the `shelf` inside Comic's own `storage` object. So the wording
 * points rather than instructs: it says these bases mention the word, and leaves the reader to
 * see whether the column is this field. Claiming otherwise would be worse than saying nothing.
 */
export async function basesMentioning(plugin: FileclassPlugin, name: string): Promise<string[]> {
	const files = plugin.app.vault.getFiles().filter((f) => f.extension === "base");
	const word = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
	const hits: string[] = [];
	for (const file of files) {
		const text = await plugin.app.vault.cachedRead(file);
		if (word.test(text)) hits.push(file.path);
	}
	return hits;
}

interface PreviewOptions {
	from: string;
	to: string;
	candidates: RenameCandidate[];
	bases: string[];
	resolve: (confirmed: boolean) => void;
}

/**
 * The list, before the write. A rename that rewrote a hundred notes on the same click as
 * "save this definition" would be the kind of surprise nobody forgives.
 */
class RenamePreviewModal extends Modal {
	private answered = false;

	constructor(app: App, private readonly opts: PreviewOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const { from, to, candidates } = this.opts;
		modalTitle(contentEl, `Rename "${from}" to "${to}"`);

		const total = candidates.reduce((n, c) => n + c.occurrences, 0);
		contentEl.createEl("p", {
			text:
				`${candidates.length} note(s) carry "${from}" and will be rewritten` +
				(total > candidates.length ? ` — ${total} occurrences in all.` : ".") +
				" The class note is already saved; this is the data.",
		});

		// What this migration will *not* do, said before the click rather than discovered after.
		if (this.opts.bases.length) {
			contentEl.createEl("p", {
				cls: "fileclass-rename-caveat",
				text:
					`${this.opts.bases.join(", ")} still mention "${from}". Bases are yours to write, ` +
					"so they are left as they are — worth checking whether the column they name is " +
					"this field.",
			});
		}

		const list = contentEl.createDiv({ cls: "fileclass-setting-list" });
		for (const { file, occurrences } of candidates) {
			new Setting(list)
				.setName(file.path)
				.setDesc(occurrences > 1 ? `${occurrences} occurrences` : `${from} → ${to}`);
		}

		const footer = makeStickyFooter(contentEl);
		new Setting(footer)
			.addButton((b) => b.setButtonText("Leave the notes alone").onClick(() => this.answer(false)))
			.addButton((b) =>
				b
					.setButtonText(`Rename in ${candidates.length} note(s)`)
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
		// Escape is an answer too, and the safe one: the notes keep the old key.
		if (!this.answered) this.opts.resolve(false);
		this.contentEl.empty();
	}
}
