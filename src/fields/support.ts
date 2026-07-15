/*
 * Pure field-support helpers (no Obsidian): which types have input support,
 * which fields are directly editable, and empty defaults. Kept out of
 * fieldActions.ts (which imports Obsidian) so this stays unit-testable.
 */
import { Field, FieldType, isRootField } from "../schema/field";

/** Types edited through a single-line text prompt. */
export const TEXT_INPUT_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
	"Input",
	"Number",
	"Date",
	"DateTime",
	"Time",
]);

/** All field types with input support so far (waves A + B + C). */
export const SUPPORTED_INPUT_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
	...TEXT_INPUT_TYPES,
	"Boolean",
	"Select",
	"Cycle",
	"Multi",
	"File",
	"MultiFile",
	"Media",
	"MultiMedia",
	"Object",
	"ObjectList",
]);

export function isInputSupported(type: FieldType): boolean {
	return SUPPORTED_INPUT_TYPES.has(type);
}

/** A note's directly-editable fields: root fields with input support. */
export function editableRootFields(fields: Field[]): Field[] {
	return fields.filter((f) => isRootField(f) && isInputSupported(f.type));
}

/** Value written when a field is inserted empty (insert-missing-fields). */
export function defaultValueFor(field: Field): unknown {
	switch (field.type) {
		case "Object":
			return {};
		case "Multi":
		case "MultiFile":
		case "MultiMedia":
		case "ObjectList":
			return [];
		default:
			return "";
	}
}
