/*
 * Value → display string for field menus and notices (ARCHITECTURE.md §7).
 * Pure. Cell rendering for the custom Bases view is a P4 concern.
 */
import { Field } from "../schema/field";
import { isEmpty, isListType } from "./validate";

export function displayValue(field: Field, value: unknown): string {
	if (isEmpty(value)) return "";
	if (field.type === "ObjectList") {
		const n = Array.isArray(value) ? value.length : 0;
		return n ? `${n} item${n > 1 ? "s" : ""}` : "";
	}
	if (field.type === "Object") {
		return value && typeof value === "object" ? "{…}" : "";
	}
	if (isListType(field.type) || Array.isArray(value)) {
		return (Array.isArray(value) ? value : [value]).map((v) => String(v)).join(", ");
	}
	if (typeof value === "boolean") return value ? "true" : "false";
	return String(value);
}
