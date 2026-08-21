/*
 * Candidate resolution for link-type fields (ARCHITECTURE.md §7, Wave B). The
 * candidate set comes from a Base view via the adapter's `getBaseRows` (D4/§6),
 * so candidates follow the **view's own order** (its `sort:`, then `groupBy`
 * flow) instead of an arbitrary vault order (issue #47) — and the same rows
 * carry the optional display column. Interactive (one scan per picker), so it
 * calls the adapter directly rather than through queryCache (which memoizes
 * repeated reads of a base).
 *
 * Graceful degradation (§6): when no base is configured, Bases is unavailable,
 * or a scan fails, it falls back to all markdown (or media) files.
 */
import { App, Notice, TFile } from "obsidian";

import { getBaseRows } from "obsidian-bases-adapter";
import { Field, FieldType } from "../schema/field";
import { rowDisplay } from "./baseOrder";
import { baseBindingOptions } from "./options";

/** Minimal host: the app plus the plugin's Bases-availability flag. */
export interface AdapterHost {
	app: App;
	basesAvailable: boolean;
}

export interface Candidate {
	file: TFile;
	display: string;
	/**
	 * Group key from the source view's `groupBy` (#47): a string, `null` for the
	 * keyless "no value" group, or `undefined` when the view isn't grouped.
	 */
	group?: string | null;
}

const MEDIA_EXTENSIONS = new Set([
	"png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif",
	"mp3", "wav", "ogg", "m4a", "flac",
	"mp4", "webm", "mov", "mkv",
	"pdf",
]);

export function isMediaType(type: FieldType): boolean {
	return type === "Media" || type === "MultiMedia";
}

function fallbackCandidates(app: App, media: boolean): Candidate[] {
	return app.vault
		.getFiles()
		.filter((f) => (media ? MEDIA_EXTENSIONS.has(f.extension.toLowerCase()) : f.extension === "md"))
		.map((f) => ({ file: f, display: f.basename }));
}

export async function resolveCandidates(
	host: AdapterHost,
	field: Field,
	currentFile: TFile
): Promise<Candidate[]> {
	const opts = baseBindingOptions(field);
	const media = isMediaType(field.type);

	if (opts.baseFile && host.basesAvailable) {
		try {
			// getBaseRows yields the files in the view's display order (sort + group
			// flow), unlike getBaseFiles' arbitrary set (#47); reuse those same rows
			// for the optional display column. When the view groups, walk `groups`
			// (group order, members contiguous) and tag each candidate with its key.
			const result = await getBaseRows(host.app, opts.baseFile, opts.viewName, currentFile.path);
			const toCandidate = (
				row: (typeof result.rows)[number],
				group?: string | null
			): Candidate => ({
				file: row.file,
				display: rowDisplay(row, opts.displayColumn, row.file.basename),
				group,
			});
			if (result.groups) {
				const out: Candidate[] = [];
				for (const g of result.groups) for (const row of g.rows) out.push(toCandidate(row, g.key));
				return out;
			}
			return result.rows.map((row) => toCandidate(row));
		} catch (err) {
			new Notice(
				`Fileclass: could not read base "${opts.baseFile}" (${(err as Error).message}). Showing all files.`
			);
		}
	} else if (opts.baseFile && !host.basesAvailable) {
		new Notice("Fileclass: Bases is unavailable; showing all files.");
	}

	return fallbackCandidates(host.app, media);
}
