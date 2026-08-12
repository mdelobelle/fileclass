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
import { ARCHIVE_DIR, archiveName, archivesToPrune, nextArchiveNumber, shouldRotate } from "./logRotation";

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
			await rotateIfNeeded(plugin, existing);
			return;
		}
		await plugin.app.vault.create(path, `${LOG_HEADER}${body}`);
	} catch {
		// Nothing to say here: whatever raised this event already spoke for itself.
	}
}

/**
 * The `.logs` folder beside the live log, created on first rotation.
 *
 * Everything under it goes through **`vault.adapter`**, not the vault API. Measured on 1.13.6: a
 * dot-folder is written to disk happily by `vault.createFolder`/`vault.create` and then never
 * indexed — `getAbstractFileByPath("Classes/.logs")` is null, so the archives were invisible to the
 * code that had just written them, every rotation reused number 0001, and the second one threw on a
 * name that already existed. The adapter lists, reads and writes them exactly as expected.
 */
function archiveFolder(plugin: FileclassPlugin): string {
	const folder = plugin.settings.classFilesPath.replace(/\/+$/, "");
	return normalizePath(folder ? `${folder}/${ARCHIVE_DIR}` : ARCHIVE_DIR);
}

/** Archive file names (basenames) currently on disk, unsorted. */
async function archiveNames(plugin: FileclassPlugin): Promise<string[]> {
	const dir = archiveFolder(plugin);
	const adapter = plugin.app.vault.adapter;
	if (!(await adapter.exists(dir))) return [];
	const listing = await adapter.list(dir);
	return listing.files.map((path) => path.slice(path.lastIndexOf("/") + 1));
}

/**
 * Rolls the live log over when it has outgrown its cap, and prunes old archives.
 *
 * The **whole file** moves, rather than its oldest half: a log split at an arbitrary line reads as
 * if something was lost, and the window can show the archives beside the live file anyway. Rotation
 * takes the next free number and renames nothing, so an archive's name never stops meaning what it
 * meant when it was written.
 */
async function rotateIfNeeded(plugin: FileclassPlugin, live: TFile): Promise<void> {
	const max = plugin.settings.schemaLogMaxEntries;
	const content = await plugin.app.vault.cachedRead(live);
	if (!shouldRotate(parseLog(content).length, max)) return;

	const keep = plugin.settings.schemaLogArchives;
	const dir = archiveFolder(plugin);
	const adapter = plugin.app.vault.adapter;
	if (keep > 0) {
		if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
		const next = archiveName(nextArchiveNumber(await archiveNames(plugin)));
		await adapter.write(`${dir}/${next}`, content);
	}
	// Emptied rather than deleted: the path stays the one the window and the docs name.
	await plugin.app.vault.modify(live, LOG_HEADER);

	for (const name of archivesToPrune(await archiveNames(plugin), keep)) {
		await adapter.remove(`${dir}/${name}`).catch(() => undefined);
	}
}

/** Every archived entry, oldest archive first — what the window adds when asked for more. */
export async function readSchemaArchives(plugin: FileclassPlugin): Promise<LogEntry[]> {
	const dir = archiveFolder(plugin);
	const names = (await archiveNames(plugin)).sort((a, b) => a.localeCompare(b));
	const out: LogEntry[] = [];
	for (const name of names) {
		try {
			out.push(...parseLog(await plugin.app.vault.adapter.read(`${dir}/${name}`)));
		} catch {
			// A damaged archive is skipped, not fatal: the live log is what matters most.
		}
	}
	return out;
}

/** How many archives are on disk, for the window's "include archives" control. */
export async function schemaArchiveCount(plugin: FileclassPlugin): Promise<number> {
	return archivesToPrune(await archiveNames(plugin), 0).length;
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
