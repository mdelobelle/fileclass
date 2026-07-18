/*
 * "Create a fileClass" command: prompt a name, capitalize it, create the
 * `<classFilesPath><Name>.md` note, and open its schema editor. A fileClass note
 * is any note under the class-files folder (the index keys it by basename).
 */
import { Notice, TFile } from "obsidian";

import type FileclassPlugin from "../../main";
import { PromptModal } from "../fields/input/valueModals";
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
	const name = capitalize(raw.trim());
	const path = `${plugin.settings.classFilesPath}${name}.md`;

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
