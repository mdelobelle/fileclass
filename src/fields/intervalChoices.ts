/*
 * Candidates for a Date field's `nextIntervalField` option (#010b QOL).
 *
 * The option used to be free text, which asked the author to remember a field
 * name, its exact spelling, and which types are eligible — and a wrong answer
 * failed silently: nextDateProvider() simply returns undefined, so the "Set next
 * date" button never appears and nothing says why. Offering the compatible
 * fields removes all three mistakes at once.
 *
 * The one thing a dropdown must not do is drop a value it doesn't recognise: a
 * stored name whose field was since renamed, retyped or removed would vanish on
 * the next save of an unrelated option. Such a value is kept as its own choice,
 * marked "(not found)", so it survives an edit and explains the missing button.
 */
import { Field, FieldType } from "../schema/field";

/** Types that can drive a next date; mirrors the check in nextDateProvider(). */
export const INTERVAL_TYPES: readonly FieldType[] = ["Duration", "CycleDuration"];

export interface IntervalChoice {
	/** Stored option value ("" for none). */
	value: string;
	/** What the dropdown shows. */
	label: string;
}

/** True when `field` can drive a next date. */
export function isIntervalField(field: Pick<Field, "type">): boolean {
	return INTERVAL_TYPES.includes(field.type);
}

/**
 * The dropdown's choices: "(none)", every compatible field by name, and the
 * current value when it matches none of them.
 *
 * @param fields  the fileClass's resolved fields (own and inherited)
 * @param current the option's stored value
 */
export function intervalFieldChoices(
	fields: readonly Pick<Field, "name" | "type">[],
	current?: string
): IntervalChoice[] {
	const candidates: IntervalChoice[] = [];
	const seen = new Set<string>();
	for (const field of fields) {
		const name = field.name?.trim();
		if (!name || !isIntervalField(field) || seen.has(name)) continue;
		seen.add(name);
		candidates.push({ value: name, label: `${name} (${field.type})` });
	}
	// An inherited field can be overridden by a same-named one; either way the
	// name is what gets stored, so one choice per name is enough.
	candidates.sort((a, b) => a.value.localeCompare(b.value));

	const choices: IntervalChoice[] = [{ value: "", label: "(none)" }, ...candidates];
	const stored = current?.trim();
	if (stored && !seen.has(stored)) {
		choices.push({ value: stored, label: `${stored} (not found)` });
	}
	return choices;
}
