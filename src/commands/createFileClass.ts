/*
 * "Create a fileClass" command: prompt a name, capitalize it, create the
 * `<classFilesPath><Name>.fileclass` file (classFilesPath is only the default
 * location — a fileClass is any `.fileclass` file, discovered vault-wide by
 * extension), and open its schema editor. The index keys the class by filename.
 */
import { Notice, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { PromptModal } from "../fields/input/valueModals";
import { FILECLASS_NAME_SUFFIX } from "../schema/constants";
import { capitalize } from "../schema/field";
import { openFileClassSchema } from "../ui/fileClassSchemaModal";

export function createFileClass(plugin: FileclassPlugin): void {
	const folder = plugin.settings.classFilesPath;
	if (!folder) {
		new Notice("Fileclass: set the class files folder in settings first.");
		return;
	}
	new PromptModal(plugin.app, {
		title: "Create a fileClass",
		placeholder: "fileClass name",
		validate: (v) => (v.trim() ? { ok: true } : { ok: false, message: "A name is required." }),
		onSubmit: (raw) => void createNote(plugin, raw),
	}).open();
}

async function createNote(plugin: FileclassPlugin, raw: string): Promise<void> {
	// Strip a suffix the user may have typed themselves so we never double it.
	const typed = capitalize(raw.trim()).replace(/\.fileclass$/i, "");
	// The name is the full filename of the non-md definition, e.g. "Book.fileclass".
	const name = `${typed}${FILECLASS_NAME_SUFFIX}`;
	const path = `${plugin.settings.classFilesPath}${name}`;

	if (plugin.app.vault.getFileByPath(path) instanceof TFile) {
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
