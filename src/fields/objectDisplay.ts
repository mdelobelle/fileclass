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
	/** Formats `value` (parsed with `parseFormat`) as `outFormat`; "" if invalid. */
	formatMoment: (value: string, parseFormat: string, outFormat: string) => string;
}

const DATE_TYPES = new Set<FieldType>(["Date", "DateTime", "Time"]);
const NATIVE_DATE_FORMAT: Partial<Record<FieldType, string>> = {
	Date: "YYYY-MM-DD",
	DateTime: "YYYY-MM-DD[T]HH:mm",
	Time: "HH:mm",
};
/**
 * What separates one item of an `ObjectList` from the next (#157).
 *
 * A pipe, not the `·` this used to be: templates use `·` themselves — the demo vault's do — so the
 * boundary between items was the same character as the punctuation inside one, and
 * `1. Paperback · 1990  ·  2. Hardcover · 1965` told them apart by nothing but double spacing.
 * That survives neither a truncated table cell nor a reader skimming a modal.
 *
 * No separator is impossible to write in a template, so this is a matter of what a display template
 * plausibly carries: `·`, `-`, `,` and `—` are all common in one, a pipe is not, and it reads as a
 * divider rather than as part of a value.
 */
const ITEM_SEP = " | ";
// {{ name }} or {{ name | format }} — name is a child field name.
const TOKEN_RE = /\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export function displayTemplateOf(field: Field): string | undefined {
	if (Array.isArray(field.options)) return undefined;
	const t = field.options.displayTemplate;
	return typeof t === "string" && t.trim() ? t : undefined;
}

/** Value → display string, honoring Object templates, ranks, and date formats. */
export function describeField(field: Field, value: unknown, deps: DisplayDeps): string {
	if (field.type === "Object") {
		// A value that is not a group at all — a string the field held before it
		// became one — rendered as nothing, so every surface showed an empty row over
		// a frontmatter that had a value in it. Show it as it stands; validation says
		// it doesn't fit.
		const stray = strayText(value);
		if (stray !== null) return stray;
		return renderObjectItem(field, asObjectValue(value), deps);
	}
	if (field.type === "ObjectList") {
		const stray = strayText(value);
		if (stray !== null) return stray;
		const items = asListValue(value);
		if (!items.length) return "";
		return items
			.map((it, i) => {
				// An item with nothing in it is named as an absence rather than left as a
				// bare rank ("3. "), which reads as a numbering accident.
				const text = strayText(it) ?? renderObjectItem(field, it, deps);
				return `${i + 1}. ${text || "(empty)"}`;
			})
			.join(ITEM_SEP);
	}
	if (DATE_TYPES.has(field.type)) return formatDate(field, value, undefined, deps);
	return displayValue(field, value);
}

/**
 * The text of a value that isn't a group (nor a list, for an ObjectList), or null
 * when the value has the right shape. Empty stays empty.
 */
export function strayText(value: unknown): string | null {
	if (value === undefined || value === null || value === "") return null;
	if (typeof value === "object") return null;
	return String(value);
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

	const filled = template
		.replace(TOKEN_RE, (_m, rawName: string, rawFmt?: string) => {
			const child = children.find((c) => c.name === rawName.trim());
			if (!child) return "";
			return childDisplay(child, object[child.name], rawFmt?.trim() || undefined, deps);
		})
		.trim();
	// Every token came back empty, so what is left is the template's own punctuation:
	// an item with nothing in it displayed as "·", which reads as a value rather than
	// as an absence. An empty item has an empty display, and the surfaces that show
	// one say "(empty)" in their own words.
	return hasContent(filled) ? filled : "";
}

/** True when a rendered template has something of the value left in it. */
function hasContent(text: string): boolean {
	return /[\p{L}\p{N}]/u.test(text);
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
	// Dates are shown as they are stored: how a date is written is the user's
	// choice (§ Date fields), so nothing reformats it here. An object display
	// template may still ask for a format explicitly — {{released|YYYY}}.
	if (!override) return raw;
	const outFormat = override;
	const parseFormat = dateOptions(field).dateFormat || NATIVE_DATE_FORMAT[field.type] || "YYYY-MM-DD";
	return deps.formatMoment(raw, parseFormat, outFormat) || raw;
}
