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
			const out: Candidate[] = [];
			if (result.groups) {
				for (const g of result.groups) for (const row of g.rows) out.push(toCandidate(row, g.key));
			} else {
				for (const row of result.rows) out.push(toCandidate(row));
			}
			// An empty answer is the one failure this path used to give silently: the picker opened
			// on nothing, with no way to tell "the base matched no files" from "the picker is
			// broken" (#199, reported from iOS, where the modal showed neither files nor an error).
			// A base that matches nothing is a legitimate answer, so this says so rather than
			// falling back to the whole vault — which would quietly ignore the field's binding.
			if (!out.length) {
				new Notice(
					`Fileclass: the base "${opts.baseFile}"${opts.viewName ? ` (view "${opts.viewName}")` : ""} ` +
						`matched no files, so there is nothing to pick here. Open that base to check its filters.`,
					8000
				);
			}
			return out;
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
