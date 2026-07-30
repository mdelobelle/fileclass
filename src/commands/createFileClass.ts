/*
 * "Create a fileClass" flows: prompt a name, capitalize it, create the
 * `<folder>/<Name>.fileclass` file, and open its schema editor. A fileClass is any
 * `.fileclass` file, discovered vault-wide by extension, so it can live anywhere:
 * the command creates it in the active file's folder, and the folder right-click
 * menu creates it in that folder. The index keys the class by filename.
 */
import { Notice, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { PromptModal } from "../fields/input/valueModals";
import { FILECLASS_NAME_SUFFIX } from "../schema/constants";
import { capitalize } from "../schema/field";
import { openFileClassSchema } from "../ui/fileClassSchemaModal";

/** Command: create a fileClass in the active file's folder (or the vault root). */
export function createFileClass(plugin: FileclassPlugin): void {
	const folder = plugin.app.workspace.getActiveFile()?.parent?.path ?? "";
	promptAndCreate(plugin, folder);
}

/** Folder right-click: create a fileClass in the given folder. */
export function createFileClassInFolder(plugin: FileclassPlugin, folderPath: string): void {
	promptAndCreate(plugin, folderPath);
}

function promptAndCreate(plugin: FileclassPlugin, folder: string): void {
	new PromptModal(plugin.app, {
		title: "Create a fileClass",
		placeholder: "fileClass name",
		validate: (v) => (v.trim() ? { ok: true } : { ok: false, message: "A name is required." }),
		onSubmit: (raw) => void createNote(plugin, folder, raw),
	}).open();
}

async function createNote(plugin: FileclassPlugin, folder: string, raw: string): Promise<void> {
	// Strip a suffix the user may have typed themselves so we never double it.
	const typed = capitalize(raw.trim()).replace(/\.fileclass$/i, "");
	// The name is the full filename of the non-md definition, e.g. "Book.fileclass".
	const name = `${typed}${FILECLASS_NAME_SUFFIX}`;
	const dir = !folder || folder === "/" ? "" : folder.endsWith("/") ? folder : `${folder}/`;
	const path = `${dir}${name}`;

	// fileClass names are vault-wide (name-keyed), so refuse a same-named class in
	// any folder — not just this path — and open the existing one instead.
	if (plugin.index.getFileClass(name) || plugin.app.vault.getFileByPath(path) instanceof TFile) {
		new Notice(`Fileclass: "${name}" already exists.`);
		openFileClassSchema(plugin, name);
		return;
	}

	try {
		await ensureFolder(plugin, path);
		await plugin.app.vault.create(path, "---\nfields: []\n---\n");
	} catch (err) {
		new Notice(`Fileclass: couldn't create "${name}" — ${(err as Error).message}`);
		return;
	}
	openFileClassSchema(plugin, name);
}

async function ensureFolder(plugin: FileclassPlugin, path: string): Promise<void> {
	const parent = path.split("/").slice(0, -1).join("/");
	if (!parent || plugin.app.vault.getFolderByPath(parent)) return;
	try {
		await plugin.app.vault.createFolder(parent);
	} catch {
		/* already exists (race) */
	}
}
