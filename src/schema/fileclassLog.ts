/*
 * The schema log (#159): a notice is read once, if at all — this keeps it.
 *
 * A rename that leaves a fileClass pointing at nothing is exactly the kind of event you discover
 * three weeks later, wondering when a field went empty. The toast says it now; this file says it
 * afterwards, with a timestamp and enough detail to act on.
 *
 * It is a **`.log`, not a note**, and that is not a detail: every markdown file under the class
 * folder is indexed as a fileClass (`FileclassIndex.rebuild`), so a `.md` log living there would
 * come back as a class of its own, with the log's lines read as a schema.
 */
import { Notice, TFile, normalizePath } from "obsidian";

import type FileclassPlugin from "../../main";

/** Where the log lives: `<class folder>/fileclass.log`, or the vault root without one. */
export function schemaLogPath(plugin: FileclassPlugin): string {
	const folder = plugin.settings.classFilesPath.replace(/\/+$/, "");
	return normalizePath(folder ? `${folder}/fileclass.log` : "fileclass.log");
}

/**
 * Appends lines to the log, creating it on first use.
 *
 * Failures are swallowed on purpose: this runs off a vault event, as a courtesy to the reader, and
 * a plugin that raised an error about its own logging would have made the problem worse than the
 * thing it was logging.
 */
export async function appendToSchemaLog(plugin: FileclassPlugin, lines: readonly string[]): Promise<void> {
	if (!lines.length || !plugin.settings.enableSchemaLog) return;
	const path = schemaLogPath(plugin);
	const body = `${lines.join("\n")}\n`;
	try {
		const existing = plugin.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await plugin.app.vault.append(existing, body);
			return;
		}
		await plugin.app.vault.create(
			path,
			"# Fileclass log\n" +
				"# Written when something in the vault leaves a fileClass definition pointing elsewhere.\n" +
				"# Fileclass never edits a definition itself — these are yours to act on.\n\n" +
				body
		);
	} catch {
		// Nothing to say to the reader here: the notice already carried the message.
	}
}

/** Opens the log, or says there is none yet — the command behind "Open the schema log". */
export async function openSchemaLog(plugin: FileclassPlugin): Promise<void> {
	const path = schemaLogPath(plugin);
	const file = plugin.app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		new Notice(`Fileclass: nothing logged yet — ${path} will be written the first time something moves.`);
		return;
	}
	await plugin.app.workspace.getLeaf(true).openFile(file);
}
