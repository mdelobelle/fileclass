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
import { Modal, Notice, Setting, TFile, TFolder, normalizePath } from "obsidian";

import type FileclassPlugin from "../../main";
import { applyTemplate } from "../engine/templateAdapter";
import { logEvent } from "../log/schemaLog";
import { ChoiceSuggestModal } from "../fields/input/valueModals";
import { missingRootFields } from "../fields/missingFields";
import { defaultValueFor } from "../fields/support";
import {
	NoteDestination,
	Seed,
	SeedSpec,
	destinationLabel,
	noteDestinations,
	noteFolder,
	planSeeds,
	safeFileName,
	uniquePath,
} from "../schema/newNote";
import { isRootField } from "../schema/field";
import { assignPropertyTypes } from "../io/propertyTypes";
import { strayFrontmatter } from "../schema/strayFrontmatter";
import { modalTitle } from "../ui/modalTitle";
import { NoteFieldsModal } from "../ui/noteFieldsModal";

export interface CreateNoteRequest {
	fileClass: string;
	/**
	 * Values to pre-fill, from the table that asked.
	 *
	 * A list, because a table can decide more than one: a reverse-relation view fixes the field it
	 * reads backwards (#154), and a filtered view fixes whatever its own filter pins down — a `Todo`
	 * table makes a note that is a Todo, or it would vanish from the table that created it.
	 */
	seeds?: Seed[];
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

/** Asks which of the class's destinations to use; undefined when the reader closed the picker. */
function pickDestination(
	plugin: FileclassPlugin,
	fileClass: string,
	destinations: readonly NoteDestination[]
): Promise<NoteDestination | undefined> {
	return new Promise((resolve) => {
		let chosen = false;
		const modal = new ChoiceSuggestModal<NoteDestination>(
			plugin.app,
			[...destinations],
			(d) => destinationLabel(d),
			(d) => {
				chosen = true;
				resolve(d);
			},
			`Which kind of ${fileClass}?`
		);
		const close = modal.onClose?.bind(modal);
		modal.onClose = () => {
			close?.();
			// Deferred by a tick: a SuggestModal **closes before** it calls its choose handler, so
			// concluding "cancelled" here would beat the choice by a fraction of a turn — measured, the
			// picker took the answer and the flow stopped dead. The input suggesters guard the same
			// ordering with their own one-turn flag (`justChose` in baseSuggest.ts).
			window.setTimeout(() => {
				if (!chosen) resolve(undefined);
			}, 0);
		};
		modal.open();
	});
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
 * The interactive half only: which context, what name. Everything after the reader has answered is
 * `createClassNote`, shared with the public API — so the command and `api.createNote` cannot drift.
 */
export async function createNoteWithClass(
	plugin: FileclassPlugin,
	req: CreateNoteRequest
): Promise<TFile | null> {
	const parsed = plugin.index.getFileClass(req.fileClass);
	if (!parsed) {
		new Notice(`Fileclass: "${req.fileClass}" is not a fileClass in this vault.`);
		return null;
	}

	// Which context, when the class offers several: asked **before** the name, because it decides
	// where the note lands and what it starts from — answering "what is it called" first would be
	// answering the smaller question first.
	const destinations = noteDestinations(parsed.options);
	let destination: NoteDestination | undefined;
	if (destinations.length > 1) {
		destination = await pickDestination(plugin, req.fileClass, destinations);
		if (!destination) return null;
	} else {
		destination = destinations[0];
	}

	const typed = await askName(plugin, req.fileClass);
	if (typed === null) return null;

	const result = await createClassNote(plugin, {
		fileClass: req.fileClass,
		name: safeFileName(typed, req.fileClass),
		destination,
		seeds: req.seeds,
		ifExists: "number",
		open: true,
		via: "command",
	});
	// Said after the fact, never asked: by now the note exists, or the reason it does not is known.
	for (const warning of result.warnings) new Notice(`Fileclass: ${warning}`, 10000);
	if (!result.ok) {
		new Notice(`Fileclass: ${result.message}`);
		return null;
	}
	return result.file;
}

/** What has been decided before a note of a class is created — by a reader, or by an API caller. */
export interface NoteCreation {
	fileClass: string;
	/** The file's base name, already made safe (`safeFileName`). */
	name: string;
	/** The context chosen; none for a class that declares none. */
	destination?: NoteDestination;
	seeds?: readonly SeedSpec[];
	/**
	 * A note of that name already in the destination folder: numbered (`Dune 1`), as the command
	 * does, or refused — an agent must be able to say "John Doe already exists" rather than make a
	 * second John Doe.
	 */
	ifExists: "number" | "refuse";
	/** Open the note, then the fields modal when `openFieldsOnCreate` is set. */
	open: boolean;
	/** Which surface asked, for the log. */
	via: "command" | "api";
}

export type NoteCreationResult =
	| { ok: true; file: TFile; warnings: string[] }
	| { ok: false; message: string; path?: string; warnings: string[] };

/**
 * Creates a note of a class once every choice is made — **never asks anything**.
 *
 * The order is the design (see the header): create empty → apply the template → write the class,
 * its missing fields and the seeds in one write → log → open. Every step after the file exists is
 * best effort: a template that fails, a seed that cannot be applied, a displaced frontmatter block —
 * none is worth destroying a note that now sits in the explorer, so they come back as `warnings`
 * for the caller to show (the command, as Notices) or return (the API).
 */
export async function createClassNote(plugin: FileclassPlugin, req: NoteCreation): Promise<NoteCreationResult> {
	const app = plugin.app;
	const warnings: string[] = [];
	const parsed = plugin.index.getFileClass(req.fileClass);
	if (!parsed) return { ok: false, message: `Unknown fileClass "${req.fileClass}"`, warnings };

	const folder = noteFolder(parsed.options, obsidianDefaultFolder(plugin), req.destination);
	let path: string;
	if (req.ifExists === "refuse") {
		const existing = existingNote(plugin, folder, req.name);
		if (existing) {
			return {
				ok: false,
				path: existing,
				message: `A note named "${req.name}" already exists in ${folder ? `"${folder}"` : "the vault root"}: ${existing}`,
				warnings,
			};
		}
		path = uniquePath(folder, req.name, () => false);
	} else {
		path = uniquePath(folder, req.name, (p) => !!app.vault.getAbstractFileByPath(p));
	}

	if (folder && !app.vault.getAbstractFileByPath(folder)) {
		await app.vault.createFolder(folder).catch(() => undefined);
	}

	let file: TFile;
	try {
		file = await app.vault.create(path, "");
	} catch (err) {
		return { ok: false, path, message: `could not create ${path} (${(err as Error).message}).`, warnings };
	}

	// 2. the template, before any frontmatter of ours exists to collide with.
	const template = req.destination?.template?.trim();
	if (template) await applyTemplate(app, normalizePath(template), file, (m) => warnings.push(m));

	// Templater may have renamed the file out from under us (`tp.file.rename()`); the template wins,
	// and the fields belong on whatever it is called now.
	const target = app.vault.getAbstractFileByPath(file.path) instanceof TFile ? file : findRenamed(plugin, file);
	if (!target) {
		return { ok: false, message: "the note was created but could not be found after templating.", warnings };
	}

	// Between the two: did the template's properties actually land as properties? Obsidian reads a
	// `---` block as frontmatter only at position 0, so one stray character above it — a backtick
	// left in a template — makes the block body text. The write below then finds no frontmatter to
	// merge into and adds its own, and the note ends up carrying its properties twice, the
	// template's values lost. Measured on a production vault; it failed silently until here.
	//
	// Said, never repaired: a template is a file its author wrote.
	if (template) await warnStrayFrontmatter(plugin, target, template, warnings);

	// 3. the class, its fields and the seed — in **one** write, deciding what is missing from the
	// frontmatter this callback holds.
	//
	// `insertMissingFields` is safe to call now (it decides inside its own write, for the same
	// reason), but this path keeps its single pass: creation then costs one write instead of three,
	// and the order the seed sits in — after the defaults, over whatever the template left — is
	// visible here rather than spread across three calls.
	//
	// The **class's** resolved fields, not the note's. `getFields(note)` asks which classes the note
	// carries, which it answers from the metadata cache — empty for a note created a moment ago, so
	// nothing was inserted at all (measured: a note arrived with its template's frontmatter and none
	// of its schema). We know the class: it is what was asked for.
	const fields = plugin.index.getResolvedFields(req.fileClass);
	const seeds = req.seeds ?? [];
	// Resolved before the write, because `generateMarkdownLink` needs the new note's path and the
	// write callback is no place to be doing lookups.
	const plan = planSeeds(
		seeds,
		req.fileClass,
		new Set(fields.filter(isRootField).map((f) => f.name)),
		(linkpath) => {
			const linked = resolveLinkTarget(plugin, linkpath, target.path);
			return linked ? app.fileManager.generateMarkdownLink(linked, target.path) : null;
		}
	);
	warnings.push(...plan.warnings);
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

		// A seed overwrites whatever the template left on its own field — see the header. Later seeds
		// win over earlier ones, so the caller puts the most specific last.
		for (const { field, value } of plan.writes) fm[field] = value;
	});

	// Same as inserting into an existing note: the class's fields are properties now, so their
	// types are Obsidian's to know rather than to infer (#207).
	assignPropertyTypes(app, fields);

	void logEvent(plugin, "INFO", "schema.note-created", `${req.fileClass}: created ${target.path}`, {
		fileClass: req.fileClass,
		note: target.path,
		via: req.via,
		...(seeds.length ? { seededFields: seeds.map((s) => s.field) } : {}),
		...(template ? { template } : {}),
	});

	if (req.open) {
		await app.workspace.getLeaf(false).openFile(target);
		if (plugin.settings.openFieldsOnCreate) new NoteFieldsModal(plugin, target).open();
	}
	return { ok: true, file: target, warnings };
}

/**
 * The note of that name already in `folder`, if any — **case-insensitively**.
 *
 * macOS and Windows file systems do not tell `John Doe.md` from `john doe.md`, so `vault.create`
 * would fail on the second; saying "it exists" with its real path is the useful answer.
 */
function existingNote(plugin: FileclassPlugin, folder: string, name: string): string | null {
	const vault = plugin.app.vault;
	const dir = folder ? vault.getAbstractFileByPath(folder) : vault.getRoot();
	if (!(dir instanceof TFolder)) return null;
	const wanted = `${name}.md`.toLowerCase();
	const hit = dir.children.find((c) => c instanceof TFile && c.name.toLowerCase() === wanted);
	return hit ? hit.path : null;
}

/**
 * The note a link seed names: an exact path first (what a table hands over), else Obsidian's own
 * link resolution from the new note (a bare name, a path without `.md`).
 */
function resolveLinkTarget(plugin: FileclassPlugin, target: string, sourcePath: string): TFile | null {
	const exact = plugin.app.vault.getAbstractFileByPath(target);
	if (exact instanceof TFile) return exact;
	return plugin.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
}

/**
 * Warns when the template left a block of properties somewhere Obsidian will not read.
 *
 * Reading the file back rather than the template: what matters is the note that now exists, and a
 * Templater template can produce anything. Failure is silence — this is a diagnostic, and a note
 * that exists is worth more than a warning about it.
 */
async function warnStrayFrontmatter(
	plugin: FileclassPlugin,
	note: TFile,
	template: string,
	warnings: string[]
): Promise<void> {
	try {
		const stray = strayFrontmatter(await plugin.app.vault.read(note));
		if (!stray) return;
		// The character itself is not quoted: it is usually invisible (a stray backtick, a blank
		// line), and echoing it into a plain-text Notice produced `` ` `` inside backticks, which
		// read as noise. The line number says where to look, which is what a reader can act on.
		warnings.push(
			`in the template "${template}", the properties start on line ${stray.line} instead ` +
				`of line 1. Obsidian only reads them at the very top of a file, so they were left in this ` +
				`note as text and it now carries them twice. Delete what sits above the first "---".`
		);
		void logEvent(
			plugin,
			"WARNING",
			"schema.template-frontmatter-displaced",
			`${template}: properties at line ${stray.line} are body text, not frontmatter`,
			{ template, note: note.path, line: stray.line, keys: stray.keys }
		);
	} catch {
		/* a diagnostic must never cost the reader their note */
	}
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
