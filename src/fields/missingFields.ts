/*
 * Which root fields a note is missing (ARCHITECTURE.md §12). Kept apart from
 * the insert command — which needs the Obsidian runtime — so the rule can be
 * tested, and so the Properties action button can ask "how many?" without
 * touching the note. One definition of "missing" for both, or the button lies.
 */
import { Field, isRootField } from "../schema/field";

/**
 * The root fields absent from a note, de-duplicated by name (a note may bind
 * several fileClasses sharing a field). `present` answers "does the note
 * already carry this field?" — the app-facing caller passes hasFieldKey.
 */
export function missingRootFields(
	fields: Field[],
	present: (field: Field) => boolean
): Field[] {
	const out: Field[] = [];
	const seen = new Set<string>();
	for (const field of fields) {
		if (!isRootField(field) || present(field) || seen.has(field.name)) continue;
		seen.add(field.name);
		out.push(field);
	}
	return out;
}

