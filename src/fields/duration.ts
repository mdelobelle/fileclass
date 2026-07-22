/*
 * RFC 5545 DURATION helpers for the Duration / MultiDuration fields (#30,
 * ARCHITECTURE §7.1). Pure, zero-dependency (no Obsidian, no moment): the
 * DURATION grammar is small and date arithmetic is done in UTC, so this is
 * fully unit-testable. Output is constrained to W/D/H/M/S (RFC 5545 forbids
 * months/years in a duration), keeping stored values RFC-valid.
 */

export interface DurationParts {
	weeks: number;
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
}

export const ZERO_DURATION: DurationParts = { weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

// P[nW] | P[nD][T[nH][nM][nS]] — at least one component; optional leading sign.
const DURATION_RE =
	/^([+-]?)P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/u;

function isAllZero(p: DurationParts): boolean {
	return !p.weeks && !p.days && !p.hours && !p.minutes && !p.seconds;
}

/** Parses an RFC 5545 / ISO 8601 duration into parts, or null if malformed. */
export function parseDuration(str: string): DurationParts | null {
	if (typeof str !== "string") return null;
	const s = str.trim();
	const m = DURATION_RE.exec(s);
	if (!m) return null;
	const parts: DurationParts = {
		weeks: m[2] ? +m[2] : 0,
		days: m[3] ? +m[3] : 0,
		hours: m[4] ? +m[4] : 0,
		minutes: m[5] ? +m[5] : 0,
		seconds: m[6] ? +m[6] : 0,
	};
	// A bare "P" or "PT" carries no component — reject it.
	if (isAllZero(parts) && !/\d/u.test(s)) return null;
	return parts;
}

/** True when `str` is a parseable, non-empty RFC 5545 duration. */
export function isValidDuration(str: string): boolean {
	const p = parseDuration(str);
	return p !== null && !isAllZero(p);
}

/**
 * Serializes parts to an RFC-5545-valid DURATION. Weeks stay standalone (`P2W`)
 * when they are the only unit; otherwise they fold into days (`P{d}DT…`), since
 * RFC 5545 forbids combining the week form with other units. All-zero → "".
 */
export function buildDuration(parts: Partial<DurationParts>): string {
	const p: DurationParts = { ...ZERO_DURATION, ...parts };
	const norm = {
		weeks: Math.max(0, Math.trunc(p.weeks) || 0),
		days: Math.max(0, Math.trunc(p.days) || 0),
		hours: Math.max(0, Math.trunc(p.hours) || 0),
		minutes: Math.max(0, Math.trunc(p.minutes) || 0),
		seconds: Math.max(0, Math.trunc(p.seconds) || 0),
	};
	if (isAllZero(norm)) return "";
	if (norm.weeks && !norm.days && !norm.hours && !norm.minutes && !norm.seconds) {
		return `P${norm.weeks}W`;
	}
	const days = norm.weeks * 7 + norm.days;
	let out = "P";
	if (days) out += `${days}D`;
	const time = [
		norm.hours ? `${norm.hours}H` : "",
		norm.minutes ? `${norm.minutes}M` : "",
		norm.seconds ? `${norm.seconds}S` : "",
	].join("");
	if (time) out += `T${time}`;
	return out;
}

/** Compact human-readable form ("1w", "1d 6h", "1h 30m"), or "" when empty. */
export function formatDuration(str: string): string {
	const p = parseDuration(str);
	if (!p || isAllZero(p)) return "";
	const tokens = [
		p.weeks ? `${p.weeks}w` : "",
		p.days ? `${p.days}d` : "",
		p.hours ? `${p.hours}h` : "",
		p.minutes ? `${p.minutes}m` : "",
		p.seconds ? `${p.seconds}s` : "",
	].filter(Boolean);
	return tokens.join(" ");
}

/** Total milliseconds a duration represents. */
export function durationMs(parts: DurationParts): number {
	return (
		(parts.weeks * 7 + parts.days) * 86_400_000 +
		parts.hours * 3_600_000 +
		parts.minutes * 60_000 +
		parts.seconds * 1000
	);
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Parses `YYYY-MM-DD` (optionally `Thh:mm`) as a floating-UTC Date. */
function parseUtc(iso: string): Date | null {
	const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/u);
	if (!m) return null;
	const [, y, mo, d, hh, mm] = m;
	return new Date(Date.UTC(+y, +mo - 1, +d, hh ? +hh : 0, mm ? +mm : 0));
}

function hasTime(iso: string): boolean {
	return /T\d{2}:\d{2}/u.test(iso);
}

/**
 * Adds a duration to an ISO date, returning a new ISO string at the input's
 * granularity (date, or date+time when `baseIso` carries a time). UTC math
 * sidesteps DST. Returns null if either input is unparseable.
 */
export function addDuration(baseIso: string, durationStr: string): string | null {
	const base = parseUtc(baseIso);
	const parts = parseDuration(durationStr);
	if (!base || !parts) return null;
	const result = new Date(base.getTime() + durationMs(parts));
	const date = `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
	if (!hasTime(baseIso)) return date;
	return `${date}T${pad(result.getUTCHours())}:${pad(result.getUTCMinutes())}`;
}
