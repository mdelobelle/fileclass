/*
 * Insert-missing-fields (ARCHITECTURE.md §12). Adds the note's resolved **root**
 * fields that are absent from its frontmatter, each with an empty default, in a
 * single processFrontMatter write (D5). Nested fields are inserted by the Object
 * editor (Wave C).
 */
import { App, Notice, TFile } from "obsidian";

import { missingRootFields } from "../fields/missingFields";
import { defaultValueFor } from "../fields/support";
import { hasFieldKey } from "../io/read";
import { reorderFrontmatter } from "../io/reorderFrontmatter";
import { ValueWrite, writeValues } from "../io/write";
import { Field } from "../schema/field";
import { UnknownKeysPosition } from "../schema/reorder";
import { getPlugin, hasPlugin } from "../globals";

/** Returns the number of fields inserted. */
export async function insertMissingFields(
	app: App,
	file: TFile,
	fields: Field[],
	/**
	 * `silent` drops the "nothing to insert" notice — the automatic run after
	 * binding a class has nothing to apologise for when a note is already complete.
	 * A write is always announced, whoever asked for it.
	 */
	{
		silent = false,
		quiet = false,
		reorder,
	}: {
		silent?: boolean;
		/**
		 * Say nothing at all, not even about a write. `silent` drops the "nothing to insert"
		 * notice while still announcing what was written, which is right for one note; a pass
		 * over a whole class would stack one notice per note over the summary that follows.
		 */
		quiet?: boolean;
		/**
		 * Put the whole frontmatter in the class's order once the missing keys are in (#104).
		 * This is where the disorder is *created* — `processFrontMatter` appends, so a note
		 * that already had keys gets the new ones after them, whatever position the class
		 * gives them. Fixing it anywhere else leaves the same clean-up to do, later.
		 *
		 * Left out, it follows the setting: this has six call sites — a command, two menus,
		 * two modals and the API — and a preference that held on some of them would be a bug
		 * report waiting to happen.
		 */
		reorder?: UnknownKeysPosition | false;
	} = {}
): Promise<number> {
	const missing = missingRootFields(fields, (f) => hasFieldKey(app, file, f));
	const writes: ValueWrite[] = missing.map((field) => ({
		namePath: [field.name],
		value: defaultValueFor(field),
	}));

	if (!writes.length) {
		if (!silent && !quiet) new Notice("Fileclass: no missing fields to insert.");
		return 0;
	}
	await writeValues(app, file, writes);
	// A second write, deliberately: the reorder needs the keys to exist before it can place
	// them, and it writes nothing at all when they already sit in the right order.
	const policy = reorder === undefined ? settingPolicy() : reorder;
	const reordered = policy ? (await reorderFrontmatter(app, file, fields, policy)).moved : 0;
	if (!quiet) {
		new Notice(
			reordered
				? `Fileclass: inserted ${writes.length} field(s), in the class's order.`
				: `Fileclass: inserted ${writes.length} field(s).`
		);
	}
	return writes.length;
}

/** The reorder-on-insert preference, or nothing when it is off (or the plugin is unloaded). */
function settingPolicy(): UnknownKeysPosition | false {
	if (!hasPlugin()) return false;
	const { reorderOnInsert, unknownKeysPosition } = getPlugin().settings;
	return reorderOnInsert ? unknownKeysPosition : false;
}
