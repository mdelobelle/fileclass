/*
 * Obsidian write layer for the fileClass schema editor (ARCHITECTURE.md §20).
 * Every mutation is a single processFrontMatter write on the fileClass note
 * (D2/D5); the pure transforms live in fileClassWrite.ts.
 */
import { App, TFile } from "obsidian";

import { RawFieldEntry } from "./fileClassWrite";

/** Applies a mutation to the note's `fields[]` array in one write. */
export async function mutateFields(
	app: App,
	file: TFile,
	fn: (fields: RawFieldEntry[]) => void
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => {
		const rec = fm as Record<string, unknown>;
		if (!Array.isArray(rec.fields)) rec.fields = [];
		fn(rec.fields as RawFieldEntry[]);
	});
}

/** Writes fileClass option keys (leaves `fields` and other keys untouched). */
export async function writeOptions(
	app: App,
	file: TFile,
	updates: Record<string, unknown>
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => {
		Object.assign(fm as Record<string, unknown>, updates);
	});
}
