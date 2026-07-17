/*
 * Rich display strings for Object / ObjectList (and date-aware) fields
 * (ARCHITECTURE.md §8). Pure — the moment formatter, the default date format,
 * and the field set are injected (see displayDeps.ts) so this stays testable.
 *
 * An Object's display is a user template like "{{designation}} - {{ville}}":
 *  - {{name}}          → the child field's own display
 *  - {{name|FORMAT}}   → a date child formatted with a moment.js token
 *  - a nested Object   → that object's own template (recursion)
 *  - no template       → the first non-empty child value
 * An ObjectList shows each item's object display prefixed by its 1-based rank.
 */
import { Field, FieldType, childFieldsOf } from "../schema/field";
import { displayValue } from "./display";
import { asListValue, asObjectValue } from "./objectDraft";
import { dateOptions } from "./options";

/** Injected dependencies (built from the plugin in displayDeps.ts). */
export interface DisplayDeps {
	/** All resolved fields, so nested children can be resolved by path. */
	allFields: Field[];
	/** Plugin-wide default moment.js format for dates; "" = show stored value. */
	defaultDateFormat: string;
	/** Formats `value` (parsed with `parseFormat`) as `outFormat`; "" if invalid. */
	formatMoment: (value: string, parseFormat: string, outFormat: string) => string;
}

const DATE_TYPES = new Set<FieldType>(["Date", "DateTime", "Time"]);
const NATIVE_DATE_FORMAT: Partial<Record<FieldType, string>> = {
	Date: "YYYY-MM-DD",
	DateTime: "YYYY-MM-DD[T]HH:mm",
	Time: "HH:mm",
};
const ITEM_SEP = "  ·  ";
// {{ name }} or {{ name | format }} — name is a child field name.
const TOKEN_RE = /\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

function displayTemplateOf(field: Field): string | undefined {
	if (Array.isArray(field.options)) return undefined;
	const t = field.options.displayTemplate;
	return typeof t === "string" && t.trim() ? t : undefined;
}

/** Value → display string, honoring Object templates, ranks, and date formats. */
export function describeField(field: Field, value: unknown, deps: DisplayDeps): string {
	if (field.type === "Object") return renderObjectItem(field, asObjectValue(value), deps);
	if (field.type === "ObjectList") {
		const items = asListValue(value);
		if (!items.length) return "";
		return items.map((it, i) => `${i + 1}. ${renderObjectItem(field, it, deps)}`).join(ITEM_SEP);
	}
	if (DATE_TYPES.has(field.type)) return formatDate(field, value, undefined, deps);
	return displayValue(field, value);
}

/** One object's display: its template, or the first non-empty child value. */
export function renderObjectItem(
	field: Field,
	object: Record<string, unknown>,
	deps: DisplayDeps
): string {
	const children = childFieldsOf(deps.allFields, field);
	const template = displayTemplateOf(field);

	if (!template) {
		for (const child of children) {
			const text = childDisplay(child, object[child.name], undefined, deps);
			if (text) return text;
		}
		return "";
	}

	return template
		.replace(TOKEN_RE, (_m, rawName: string, rawFmt?: string) => {
			const child = children.find((c) => c.name === rawName.trim());
			if (!child) return "";
			return childDisplay(child, object[child.name], rawFmt?.trim() || undefined, deps);
		})
		.trim();
}

function childDisplay(
	child: Field,
	value: unknown,
	dateFormatOverride: string | undefined,
	deps: DisplayDeps
): string {
	if (child.type === "Object") return renderObjectItem(child, asObjectValue(value), deps);
	if (child.type === "ObjectList") return describeField(child, value, deps);
	if (DATE_TYPES.has(child.type)) return formatDate(child, value, dateFormatOverride, deps);
	return displayValue(child, value);
}

function formatDate(
	field: Field,
	value: unknown,
	override: string | undefined,
	deps: DisplayDeps
): string {
	if (value === undefined || value === null || value === "") return "";
	const raw = String(value);
	// Insert-as-link dates are stored as wikilinks — show them verbatim.
	if (/^!?\[\[.*\]\]$/.test(raw.trim())) return raw;
	const outFormat = override ?? deps.defaultDateFormat;
	if (!outFormat) return raw; // no display format configured → stored value
	const parseFormat = dateOptions(field).dateFormat || NATIVE_DATE_FORMAT[field.type] || "YYYY-MM-DD";
	return deps.formatMoment(raw, parseFormat, outFormat) || raw;
}
