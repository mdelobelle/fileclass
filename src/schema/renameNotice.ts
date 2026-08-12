/*
 * Telling you that a rename left a schema pointing at nothing (#159) — the app-facing half.
 *
 * The rules are next door in `renamePaths.ts`, with the tests. This walks the class notes and
 * raises one notice. It **never writes**: a fileClass definition is the author's, and a plugin that
 * quietly rewrote one would have to be trusted rather than read.
 *
 * It runs on every rename, so it costs nothing when there is nothing to say: frontmatter comes from
 * the metadata cache, already in memory, and no file is opened.
 */
import { Notice, TAbstractFile, TFile, TFolder } from "obsidian";

import type FileclassPlugin from "../../main";
import { logStamp } from "../log/logLine";
import { logEvents } from "../log/schemaLog";
import {
	RenameEvent,
	StaleReference,
	consequenceOf,
	describeStale,
	referenceLabel,
	staleReferences,
} from "./renamePaths";

/** Warns when a class note still names `oldPath`; silent — and cheap — when none does. */
export function warnOnStalePaths(plugin: FileclassPlugin, file: TAbstractFile, oldPath: string): void {
	const ev: RenameEvent = { oldPath, newPath: file.path, isFolder: file instanceof TFolder };
	if (ev.oldPath === ev.newPath) return;

	const found: { label: string; ref: StaleReference }[] = [];
	for (const name of plugin.index.fileClassNames) {
		const note = plugin.index.getFileClassFile(name);
		if (!(note instanceof TFile)) continue;
		// The renamed file being a class note is the index's business, not this warning's.
		if (note.path === ev.newPath) continue;
		const fm = plugin.app.metadataCache.getFileCache(note)?.frontmatter;
		if (!fm) continue;
		for (const ref of staleReferences(fm, ev)) found.push({ label: referenceLabel(name, ref), ref });
	}

	if (!found.length) return;
	// Long, because it has to survive being read once: a five-second toast that only said
	// "a path changed" would send the reader hunting through every class.
	new Notice(
		describeStale(ev.oldPath, found.map((f) => f.label), consequenceOf(found[0].ref)),
		15000
	);
	// And kept, since a notice is gone in fifteen seconds and this is the kind of breakage found
	// three weeks later. One entry per reference, so the viewer can act on each.
	const stamp = logStamp(new Date());
	void logEvents(
		plugin,
		found.map(({ label, ref }) => ({
			stamp,
			level: "ERROR" as const,
			event: ev.isFolder ? "schema.folder-moved" : "schema.file-moved",
			message: `${label}: "${ev.oldPath}" moved to "${ev.newPath}" — ${consequenceOf(ref)}`,
			details: {
				fileClass: label.split(" › ")[0],
				...(ref.field ? { field: ref.field } : {}),
				key: ref.key,
				from: ev.oldPath,
				to: ev.newPath,
			},
		}))
	);
}
