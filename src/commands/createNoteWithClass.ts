/*
 * Creating a note that already belongs to a fileClass (#84).
 *
 * A `fileclass-table` shows every note of a class except the one you are about to write. Creating
 * it by hand means: a file somewhere, the folder convention remembered, the `fileClass` key typed,
 * then *Insert missing fields*. This is that, as one gesture.
 *
 * **The order is the design, not an implementation detail.** Create empty → apply the template →
 * write the class and its fields → open the fields modal. Template first, because frontmatter
 * written *before* a template that declares its own gives two `---` blocks and broken YAML; this
 * way `processFrontMatter` merges into whatever the template left, so a duplicate block is
 * impossible by construction. And `insertMissingFields` fills only what is missing, so a value the
 * template set is kept.
 *
 * One exception, from #154: a **seed**. "New Book with Frank Herbert" is an unambiguous instruction
 * about one field, where a template's default is a general preference — so the seed overwrites, and
 * nothing else does.
 */
import { Modal, Notice, Setting, TFile, normalizePath } from "obsidian";

import type FileclassPlugin from "../../main";
import { applyTemplate } from "../engine/templateAdapter";
import { logEvent } from "../log/schemaLog";
import { missingRootFields } from "../fields/missingFields";
import { defaultValueFor } from "../fields/support";
import { Seed, noteFolder, safeFileName, uniquePath } from "../schema/newNote";
import { modalTitle } from "../ui/modalTitle";
import { NoteFieldsModal } from "../ui/noteFieldsModal";

export interface CreateNoteRequest {
	fileClass: string;
	/** A value to pre-fill, from the table that asked (#154). */
	seed?: Seed;
}

/** Obsidian's own "default location for new notes", as a folder path. */
function obsidianDefaultFolder(plugin: FileclassPlugin): string {
	const vault = plugin.app.vault as unknown as {
		getConfig?: (key: string) => unknown;
	};
	const mode = vault.getConfig?.("newFileLocation");
	const folder = vault.getConfig?.("newFileFolderPath");
	// "folder" is the only mode with a path of its own; "current" and "root" resolve elsewhere and
	// the vault root is the honest answer for both here.
	return mode === "folder" && typeof folder === "string" ? folder : "";
}

/**
 * Asks for the note's name, suggesting the class's own.
 *
 * The class name and nothing more, seeded or not: "Book — Frank Herbert" reads like a title and is
 * not one — the note is a book *by* him, whose name only the reader knows.
 */
function askName(plugin: FileclassPlugin, fileClass: string): Promise<string | null> {
	return new Promise((resolve) => {
		let settled = false;
		const modal = new Modal(plugin.app);
		let value = fileClass;
		modal.onOpen = () => {
			modalTitle(modal.contentEl, `New ${fileClass}`);
			new Setting(modal.contentEl).setName("Name").addText((t) => {
				t.setValue(value).onChange((v) => (value = v));
				// Selected rather than emptied: the suggestion is a starting point, and typing over
				// it costs nothing while retyping the class name costs the whole point.
				window.setTimeout(() => {
					t.inputEl.focus();
					t.inputEl.select();
				}, 0);
				t.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						settled = true;
						resolve(value);
						modal.close();
					}
				});
			});
			new Setting(modal.contentEl).addButton((b) =>
				b
					.setButtonText("Create")
					.setCta()
					.onClick(() => {
						settled = true;
						resolve(value);
						modal.close();
					})
			);
		};
		modal.onClose = () => {
			modal.contentEl.empty();
			if (!settled) resolve(null);
		};
		modal.open();
	});
}

/**
 * Creates a note of `fileClass`, and returns it (or null when nothing was created).
 *
 * Every step after the file exists is best-effort: a template that fails, a seed that cannot be
 * written, a modal that will not open — none of them are worth destroying a note the reader asked
 * for and can see in their explorer.
 */
export async function createNoteWithClass(
	plugin: FileclassPlugin,
	req: CreateNoteRequest
): Promise<TFile | null> {
	const app = plugin.app;
	const parsed = plugin.index.getFileClass(req.fileClass);
	if (!parsed) {
		new Notice(`Fileclass: "${req.fileClass}" is not a fileClass in this vault.`);
		return null;
	}

	const typed = await askName(plugin, req.fileClass);
	if (typed === null) return null;

	const folder = noteFolder(parsed.options, obsidianDefaultFolder(plugin));
	const path = uniquePath(folder, safeFileName(typed, req.fileClass), (p) => !!app.vault.getAbstractFileByPath(p));

	if (folder && !app.vault.getAbstractFileByPath(folder)) {
		await app.vault.createFolder(folder).catch(() => undefined);
	}

	let file: TFile;
	try {
		file = await app.vault.create(path, "");
	} catch (err) {
		new Notice(`Fileclass: could not create ${path} (${(err as Error).message}).`);
		return null;
	}

	// 2. the template, before any frontmatter of ours exists to collide with.
	const template = parsed.options.fileClassNoteTemplate?.trim();
	if (template) await applyTemplate(app, normalizePath(template), file);

	// Templater may have renamed the file out from under us (`tp.file.rename()`); the template wins,
	// and the fields belong on whatever it is called now.
	const target = app.vault.getAbstractFileByPath(file.path) instanceof TFile ? file : findRenamed(plugin, file);
	if (!target) {
		new Notice("Fileclass: the note was created but could not be found after templating.");
		return null;
	}

	// 3. the class, its fields and the seed — in **one** write, deciding what is missing from the
	// frontmatter this callback holds.
	//
	// Not `insertMissingFields`, and this is the whole reason: its presence test reads the metadata
	// cache (`hasFieldKey`), which a template that has just written the file leaves stale. Measured
	// with Templater — every field looked missing, so the insert wrote an empty default over
	// `publisher: Chilton Books` and over a date the template had computed. The cache is fine for a
	// note the reader has been looking at; it is the wrong source the instant somebody else wrote.
	const seed = req.seed;
	const seedValue = seed ? resolveSeedValue(plugin, seed, target) : "";
	const fields = plugin.index.getFields(target);
	await app.fileManager.processFrontMatter(target, (fm: Record<string, unknown>) => {
		const has = (name: string): boolean => Object.prototype.hasOwnProperty.call(fm, name);
		const alias = plugin.settings.fileClassAlias;
		// Always written, even when the folder already binds it: the alias is the highest-priority
		// binding and the only one that survives the note being moved.
		const existing = fm[alias];
		if (Array.isArray(existing)) {
			if (!existing.includes(req.fileClass)) existing.push(req.fileClass);
		} else if (typeof existing === "string" && existing && existing !== req.fileClass) {
			fm[alias] = [existing, req.fileClass];
		} else {
			fm[alias] = req.fileClass;
		}

		// Only what the template did not already set: its values are kept, by construction.
		for (const field of missingRootFields(fields, (f) => has(f.name))) {
			fm[field.name] = defaultValueFor(field);
		}

		// The seed overwrites whatever the template left on that one field — see the header.
		if (seed && seedValue) fm[seed.field] = seedValue;
	});

	void logEvent(plugin, "INFO", "schema.note-created", `${req.fileClass}: created ${target.path}`, {
		fileClass: req.fileClass,
		note: target.path,
		...(seed ? { seededField: seed.field } : {}),
		...(template ? { template } : {}),
	});

	await app.workspace.getLeaf(false).openFile(target);
	if (plugin.settings.openFieldsOnCreate) new NoteFieldsModal(plugin, target).open();
	return target;
}

/**
 * The seed's value, in the vault's own link format when it names a note.
 *
 * Resolved before the write, because `generateMarkdownLink` needs the new note's path and the write
 * callback is no place to be doing lookups.
 */
function resolveSeedValue(plugin: FileclassPlugin, seed: Seed, target: TFile): string {
	const linked = seed.linkTo ? plugin.app.vault.getAbstractFileByPath(seed.linkTo) : null;
	return linked instanceof TFile
		? plugin.app.fileManager.generateMarkdownLink(linked, target.path)
		: seed.value ?? "";
}

/**
 * The note a template renamed, found by its creation time.
 *
 * Templater's `tp.file.rename()` moves the file after we created it, so the `TFile` we hold may name
 * a path that no longer exists. The newest markdown file is the one we just made.
 */
function findRenamed(plugin: FileclassPlugin, original: TFile): TFile | null {
	const candidates = plugin.app.vault
		.getMarkdownFiles()
		.filter((f) => Math.abs(f.stat.ctime - original.stat.ctime) < 5000)
		.sort((a, b) => b.stat.ctime - a.stat.ctime);
	return candidates[0] ?? null;
}
