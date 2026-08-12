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
import { Seed, noteFolder, safeFileName, uniquePath } from "../schema/newNote";
import { modalTitle } from "../ui/modalTitle";
import { NoteFieldsModal } from "../ui/noteFieldsModal";
import { insertMissingFields } from "./insertMissingFields";

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

	// 3. the class, then its fields.
	await app.fileManager.processFrontMatter(target, (fm: Record<string, unknown>) => {
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
	});

	await insertMissingFields(app, target, plugin.index.getFields(target), { quiet: true, reorder: false });

	// The seed overwrites whatever the template left on that one field — see the header.
	const seed = req.seed;
	if (seed) {
		const linked = seed.linkTo ? app.vault.getAbstractFileByPath(seed.linkTo) : null;
		const value =
			linked instanceof TFile
				? app.fileManager.generateMarkdownLink(linked, target.path)
				: seed.value ?? "";
		if (value) {
			await app.fileManager.processFrontMatter(target, (fm: Record<string, unknown>) => {
				fm[seed.field] = value;
			});
		}
	}

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
