/*
 * Reading and writing a date field's stored value, apart from the picker that
 * used to own these rules.
 *
 * Two paths now write a date: the picker's Save, and "Set next date" (its button,
 * or Alt-click on a date control). They must agree — a field stored as
 * `[[Daily/Notes/2026/10/2026-10-29 Thu|…]]` cannot become a bare `2026-10-29`
 * because the user took the shortcut. Everything here is pure (moment formatting
 * is injected), so the agreement is testable.
 */
import { FieldType } from "../schema/field";

import { buildDateLink, MomentFormatter } from "./dateLink";

/** What a blank `dateFormat` stores, per type — the sortable native forms. */
export const NATIVE_DATE_FORMATS: Partial<Record<FieldType, string>> = {
	Date: "YYYY-MM-DD",
	DateTime: "YYYY-MM-DD[T]HH:mm",
	Time: "HH:mm",
};

export function nativeDateFormat(type: FieldType): string {
	return NATIVE_DATE_FORMATS[type] ?? "YYYY-MM-DD";
}

/** True when the stored value is a wikilink (`[[…]]` or an embed). */
export function isDateLink(stored: string): boolean {
	return /^!?\[\[.*\]\]$/.test(stored.trim());
}

/**
 * The date text inside a stored value: the value itself, or — for a link — the
 * basename of its target, dropping any folder prefix and `#heading`/`|alias`.
 */
export function dateTextOf(stored: string): string {
	const raw = stored.trim();
	const m = raw.match(/^!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/);
	if (!m) return raw;
	return m[1].split("/").pop() ?? m[1];
}

export interface DateWriteOptions {
	/** The field's `dateFormat`; blank means store the native form. */
	dateFormat?: string;
	linkPath?: string;
	alias?: boolean;
}

/**
 * The value to store for `nativeIso`, applying the field's format and — when
 * `asLink` — its link shape.
 *
 * @param nativeIso the date in its native form (`YYYY-MM-DD`, or with a time)
 * @param format    formats a native date with a moment format string
 */
export function storedDateValue(
	nativeIso: string,
	{ dateFormat, linkPath, alias }: DateWriteOptions,
	asLink: boolean,
	format: MomentFormatter
): string {
	const date = dateFormat ? format(nativeIso, dateFormat) : nativeIso;
	return asLink ? buildDateLink(date, nativeIso, { linkPath, alias }, format) : date;
}
