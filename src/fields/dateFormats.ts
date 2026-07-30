/*
 * The format a date field is *written* in.
 *
 * A `Date`/`DateTime`/`Time` field may carry its own `dateFormat`; when it
 * doesn't, the plugin-wide default for that type applies (Settings → Fileclass →
 * Default date / datetime / time format). Blank everywhere means the native ISO
 * form — `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, `HH:mm`.
 *
 * Storage, not display: how a date is written in your vault is a deliberate
 * choice (a wikilink to a daily note, `DD/MM/YYYY`, ISO…), and ordering is
 * recovered in a base with a formula. Nothing here reformats what is shown.
 *
 * The default is folded into the *resolved* field (fileclassIndex.resolve), so
 * every consumer — the input modal, validation, display parsing — sees one
 * effective format and no one has to remember to consult the settings. The
 * schema editor is unaffected: it reads the fileClass note itself, so a field
 * with no format of its own still shows a blank one.
 */
import { Field, FieldType } from "../schema/field";

/** Plugin-wide write formats, per date type ("" = the native ISO form). */
export interface DateFormatDefaults {
	Date: string;
	DateTime: string;
	Time: string;
}

export const NO_DATE_DEFAULTS: DateFormatDefaults = { Date: "", DateTime: "", Time: "" };

const DATE_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["Date", "DateTime", "Time"]);

export function isDateType(type: FieldType): boolean {
	return DATE_TYPES.has(type);
}

/** The default that applies to `type`, or "" for a non-date type. */
export function defaultFormatFor(type: FieldType, defaults: DateFormatDefaults): string {
	if (type === "Date") return defaults.Date.trim();
	if (type === "DateTime") return defaults.DateTime.trim();
	if (type === "Time") return defaults.Time.trim();
	return "";
}

/**
 * The format `field` is written in: its own, else the default for its type,
 * else undefined (the native ISO form).
 */
export function effectiveDateFormat(
	field: Field,
	defaults: DateFormatDefaults
): string | undefined {
	if (!isDateType(field.type)) return undefined;
	const own = !Array.isArray(field.options) ? field.options.dateFormat : undefined;
	if (typeof own === "string" && own.trim()) return own;
	return defaultFormatFor(field.type, defaults) || undefined;
}

/**
 * Same fields, with the per-type default folded into any date field that has no
 * format of its own. Returns the input array untouched when there is nothing to
 * fold — the common case, since the defaults are blank out of the box.
 */
export function withDefaultDateFormats(fields: Field[], defaults: DateFormatDefaults): Field[] {
	if (!defaults.Date.trim() && !defaults.DateTime.trim() && !defaults.Time.trim()) return fields;
	let changed = false;
	const out = fields.map((field) => {
		if (!isDateType(field.type) || Array.isArray(field.options)) return field;
		const own = field.options.dateFormat;
		if (typeof own === "string" && own.trim()) return field;
		const fallback = defaultFormatFor(field.type, defaults);
		if (!fallback) return field;
		changed = true;
		return { ...field, options: { ...field.options, dateFormat: fallback } };
	});
	return changed ? out : fields;
}
