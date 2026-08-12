/*
 * Writing the schema log (#159) — the app-facing half of `logLine.ts`.
 *
 * A notice lasts fifteen seconds; this is the kind of breakage found three weeks later. The file is
 * a **`.log`, not a note**, and that is not cosmetic: `FileclassIndex.rebuild` reads every markdown
 * file under the class folder as a fileClass, so a `.md` log living there would come back as a
 * class of its own, its lines read as a schema.
 */
import { Notice, TFile, normalizePath } from "obsidian";

import type FileclassPlugin from "../../main";
import { LOG_HEADER, LogEntry, LogLevel, formatLine, logStamp, parseLog } from "./logLine";

/** Where the log lives: `<class folder>/fileclass.log`, or the vault root without one. */
export function schemaLogPath(plugin: FileclassPlugin): string {
	const folder = plugin.settings.classFilesPath.replace(/\/+$/, "");
	return normalizePath(folder ? `${folder}/fileclass.log` : "fileclass.log");
}

/**
 * Appends one event.
 *
 * Failures are swallowed on purpose: this runs off vault events, as a courtesy, and a plugin that
 * raised an error about its own logging would have made the problem worse than the thing it logged.
 */
export async function logEvent(
	plugin: FileclassPlugin,
	level: LogLevel,
	event: string,
	message: string,
	details?: Record<string, unknown>
): Promise<void> {
	await logEvents(plugin, [{ stamp: logStamp(new Date()), level, event, message, details }]);
}

/** Appends several events under one write, so a sweep is one file operation. */
export async function logEvents(plugin: FileclassPlugin, entries: readonly LogEntry[]): Promise<void> {
	if (!entries.length || !plugin.settings.enableSchemaLog) return;
	const body = `${entries.map(formatLine).join("\n")}\n`;
	const path = schemaLogPath(plugin);
	try {
		const existing = plugin.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await plugin.app.vault.append(existing, body);
			return;
		}
		await plugin.app.vault.create(path, `${LOG_HEADER}${body}`);
	} catch {
		// Nothing to say here: whatever raised this event already spoke for itself.
	}
}

/** Everything the log holds, oldest first — what the viewer reads. */
export async function readSchemaLog(plugin: FileclassPlugin): Promise<LogEntry[]> {
	const file = plugin.app.vault.getAbstractFileByPath(schemaLogPath(plugin));
	if (!(file instanceof TFile)) return [];
	try {
		return parseLog(await plugin.app.vault.cachedRead(file));
	} catch {
		return [];
	}
}

/** Opens the raw file, for a reader who would rather have the text than the viewer. */
export async function openSchemaLogFile(plugin: FileclassPlugin): Promise<void> {
	const path = schemaLogPath(plugin);
	const file = plugin.app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		new Notice(`Fileclass: nothing logged yet — ${path} is written the first time something happens.`);
		return;
	}
	await plugin.app.workspace.getLeaf(true).openFile(file);
}
