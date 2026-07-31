/*
 * Building the wikilink form of a date value (the "insert as link" option).
 *
 * Two things the plain `[[prefix + date]]` concatenation couldn't express, both
 * needed by the way daily notes are actually filed:
 *
 *  - a **date-dependent folder**: `Daily/Notes/{{YYYY}}/{{MM}}/`. Only the braced
 *    tokens go through moment — a raw moment format over the whole path would
 *    mangle the literal words (`Daily` → the `D` is day-of-month, the `a` is
 *    am/pm), and `{{YYYY}}` is already the syntax daily-notes and Templater users
 *    write.
 *  - an **alias**, so the link reads as the date instead of its whole path:
 *    `[[Daily/Notes/2026/07/2026-07-30 Thu|2026-07-30 Thu]]`.
 *
 * Pure: the moment formatting is injected, so this is testable without Obsidian.
 */

/** Formats an ISO date (`YYYY-MM-DD`, or with a time part) with a moment format. */
export type MomentFormatter = (isoDate: string, format: string) => string;

export interface DateLinkOptions {
	/** Folder prefix, with optional `{{moment}}` tokens. A trailing / is optional. */
	linkPath?: string;
	/** Add `|<date>` so the link displays the date, not the path. */
	alias?: boolean;
}

/** `{{YYYY}}`, `{{MM}}`, `{{YYYY-MM}}`… — anything moment understands. */
const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Expands the `{{…}}` tokens of a link path for `isoDate`. Text outside the
 * braces is left exactly as written.
 */
export function expandLinkPath(
	linkPath: string,
	isoDate: string,
	formatMoment: MomentFormatter
): string {
	return linkPath.replace(TOKEN_RE, (_, token: string) => formatMoment(isoDate, token) || "");
}

/**
 * The stored value for a date kept as a link.
 *
 * @param date     the date as the field stores it (already formatted)
 * @param isoDate  the same date in ISO, used to expand the path tokens
 */
export function buildDateLink(
	date: string,
	isoDate: string,
	{ linkPath = "", alias = false }: DateLinkOptions,
	formatMoment: MomentFormatter
): string {
	let path = expandLinkPath(linkPath, isoDate, formatMoment).trim();
	if (path && !path.endsWith("/")) path += "/";
	// A path that starts with / would point outside the vault root.
	if (path.startsWith("/")) path = path.slice(1);
	const target = `${path}${date}`;
	return alias && path ? `[[${target}|${date}]]` : `[[${target}]]`;
}
