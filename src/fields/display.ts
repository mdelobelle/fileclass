/*
 * Value → display string for field menus and notices (ARCHITECTURE.md §7).
 * Pure. Cell rendering for the custom Bases view is a P4 concern.
 */
import { Field } from "../schema/field";
import { formatDuration } from "./duration";
import { isEmpty, isListType } from "./validate";

export function displayValue(field: Field, value: unknown): string {
	if (isEmpty(value)) return "";
	if (field.type === "Duration") return formatDuration(String(value)) || String(value);
	if (field.type === "MultiDuration" && Array.isArray(value)) {
		return value.map((v) => formatDuration(String(v)) || String(v)).join(", ");
	}
	if (field.type === "ObjectList") {
		const n = Array.isArray(value) ? value.length : 0;
		return n ? `${n} item${n > 1 ? "s" : ""}` : "";
	}
	if (field.type === "Object" || field.type === "JSON" || field.type === "YAML") {
		if (Array.isArray(value)) return `[…] (${value.length})`;
		if (value && typeof value === "object") return "{…}";
		return String(value);
	}
	if (isListType(field.type) || Array.isArray(value)) {
		return (Array.isArray(value) ? value : [value]).map((v) => String(v)).join(", ");
	}
	if (typeof value === "boolean") return value ? "true" : "false";
	return String(value);
}
