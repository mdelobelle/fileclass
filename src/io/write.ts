/*
 * Frontmatter writes (ARCHITECTURE.md §4, D2, D5). Every user action results in
 * a single `processFrontMatter` write. Values are placed by name-path via
 * objectPath; writing `undefined` removes the key. The mutation is applied to
 * the user's own frontmatter object, preserving unknown keys (D5).
 */
import { App, TFile } from "obsidian";

import { PathSegment, removeAtPath, setAtPath } from "../engine/objectPath";
import { Field } from "../schema/field";

export interface ValueWrite {
	namePath: PathSegment[];
	/** `undefined` removes the key. */
	value: unknown;
}

function applyWrite(frontmatter: Record<string, unknown>, write: ValueWrite): void {
	if (write.value === undefined) removeAtPath(frontmatter, write.namePath);
	else setAtPath(frontmatter, write.namePath, write.value);
}

/** Writes a single value at a name-path (one processFrontMatter write). */
export async function writeValueAtPath(
	app: App,
	file: TFile,
	namePath: PathSegment[],
	value: unknown
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => applyWrite(fm, { namePath, value }));
}

/** Writes several values in a single processFrontMatter write (D5). */
export async function writeValues(app: App, file: TFile, writes: ValueWrite[]): Promise<void> {
	if (!writes.length) return;
	await app.fileManager.processFrontMatter(file, (fm) => {
		for (const write of writes) applyWrite(fm, write);
	});
}

/** Writes a root field's value (keyed by its name). */
export function writeFieldValue(
	app: App,
	file: TFile,
	field: Field,
	value: unknown
): Promise<void> {
	return writeValueAtPath(app, file, [field.name], value);
}
