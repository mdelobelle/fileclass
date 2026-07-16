/*
 * Candidate resolution for link-type fields (ARCHITECTURE.md §7, Wave B). The
 * candidate set comes from a Base view via the adapter's public functions
 * (D4/§6): getBaseFiles for the files, getBaseRows for an optional display
 * column. Interactive (one scan per picker), so it calls the adapter directly
 * rather than through queryCache (which memoizes repeated reads of a base).
 *
 * Graceful degradation (§6): when no base is configured, Bases is unavailable,
 * or a scan fails, it falls back to all markdown (or media) files.
 */
import { App, Notice, TFile } from "obsidian";

import { getBaseFiles, getBaseRows } from "../engine/basesAdapter";
import { Field, FieldType } from "../schema/field";
import { baseBindingOptions } from "./options";

/** Minimal host: the app plus the plugin's Bases-availability flag. */
export interface AdapterHost {
	app: App;
	basesAvailable: boolean;
}

export interface Candidate {
	file: TFile;
	display: string;
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
			const files = await getBaseFiles(host.app, opts.baseFile, opts.viewName, currentFile.path);
			let displayByPath: Map<string, string> | undefined;
			if (opts.displayColumn) {
				const result = await getBaseRows(
					host.app,
					opts.baseFile,
					opts.viewName,
					currentFile.path
				);
				displayByPath = new Map();
				for (const row of result.rows) {
					displayByPath.set(row.file.path, row.values[opts.displayColumn] ?? row.file.basename);
				}
			}
			return files.map((f) => ({ file: f, display: displayByPath?.get(f.path) ?? f.basename }));
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
