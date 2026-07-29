/*
 * Obsidian write layer for the fileClass schema editor (ARCHITECTURE.md §20).
 * `.fileclass` files are not markdown, so `processFrontMatter` cannot be used;
 * each mutation reads the file, parses its YAML block, applies the change, and
 * writes it back in one `vault.process` (preserving the trailing body verbatim).
 * Pure transforms live in fileClassWrite.ts; split/assemble in fileClassSource.ts.
 */
import { App, TFile, parseYaml, stringifyYaml } from "obsidian";

import { assembleFileClassSource, splitFileClassSource } from "./fileClassSource";
import { RawFieldEntry } from "./fileClassWrite";

/** Reads, mutates, and rewrites a `.fileclass` file's YAML in one atomic write. */
async function editSource(
	app: App,
	file: TFile,
	fn: (obj: Record<string, unknown>) => void
): Promise<void> {
	await app.vault.process(file, (raw) => {
		const { frontmatter, body } = splitFileClassSource(raw);
		let obj: Record<string, unknown> = {};
		if (frontmatter.trim()) {
			const y: unknown = parseYaml(frontmatter);
			if (y && typeof y === "object") obj = y as Record<string, unknown>;
		}
		fn(obj);
		return assembleFileClassSource(stringifyYaml(obj), body);
	});
}

/** Applies a mutation to the definition's `fields[]` array in one write. */
export async function mutateFields(
	app: App,
	file: TFile,
	fn: (fields: RawFieldEntry[]) => void
): Promise<void> {
	await editSource(app, file, (obj) => {
		if (!Array.isArray(obj.fields)) obj.fields = [];
		fn(obj.fields as RawFieldEntry[]);
	});
}

/** Writes fileClass option keys (leaves `fields` and other keys untouched). */
export async function writeOptions(
	app: App,
	file: TFile,
	updates: Record<string, unknown>
): Promise<void> {
	await editSource(app, file, (obj) => {
		Object.assign(obj, updates);
	});
}
