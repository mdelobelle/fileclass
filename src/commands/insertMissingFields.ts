/*
 * Insert-missing-fields (ARCHITECTURE.md §12). Adds the note's resolved **root**
 * fields that are absent from its frontmatter, each with an empty default, in a
 * single processFrontMatter write (D5). Nested fields are inserted by the Object
 * editor (Wave C).
 */
import { App, Notice, TFile } from "obsidian";

import { defaultValueFor } from "../fields/fieldActions";
import { hasFieldKey } from "../io/read";
import { ValueWrite, writeValues } from "../io/write";
import { Field, isRootField } from "../schema/field";

/** Returns the number of fields inserted. */
export async function insertMissingFields(
	app: App,
	file: TFile,
	fields: Field[]
): Promise<number> {
	const missing = fields.filter((f) => isRootField(f) && !hasFieldKey(app, file, f));
	// De-duplicate by name (a note may bind several fileClasses sharing a field).
	const seen = new Set<string>();
	const writes: ValueWrite[] = [];
	for (const field of missing) {
		if (seen.has(field.name)) continue;
		seen.add(field.name);
		writes.push({ namePath: [field.name], value: defaultValueFor(field) });
	}

	if (!writes.length) {
		new Notice("Fileclass: no missing fields to insert.");
		return 0;
	}
	await writeValues(app, file, writes);
	new Notice(`Fileclass: inserted ${writes.length} field(s).`);
	return writes.length;
}
