/*
 * Pure value validators for Wave A field types (ARCHITECTURE.md §7). No
 * Obsidian; fully unit-tested. Empty values (undefined/null/"") are always
 * valid — Fileclass fields are optional unless a later constraint says otherwise.
 *
 * Membership checks (Select/Cycle/Multi) take the already-resolved
 * `allowedValues` (see values.ts); an empty list means "unconstrained".
 */
import { Field, FieldType } from "../schema/field";
import { isValidDuration } from "./duration";
import { isValidLocation } from "./location";
import { numberOptions } from "./options";

export interface ValidationResult {
	ok: boolean;
	message?: string;
}

export const VALID: ValidationResult = { ok: true };
export function invalid(message: string): ValidationResult {
	return { ok: false, message };
}

/** List types whose allowed values come from a values source (Wave A). */
export const MULTI_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["Multi"]);

/** All types that store a list value (for display/iteration). */
export const LIST_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
	"Multi",
	"MultiInput",
	"CycleDuration",
	"MultiFile",
	"MultiMedia",
]);

export function isListType(type: FieldType): boolean {
	return LIST_TYPES.has(type);
}

/** Types whose value is checked against an allowed-values list (Select/Cycle/Multi). */
export const CHOICE_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["Select", "Cycle", "Multi"]);
export function hasAllowedValues(type: FieldType): boolean {
	return CHOICE_TYPES.has(type);
}

export function isEmpty(value: unknown): boolean {
	return value == null || value === "";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

function validateNumber(value: unknown, field: Field): ValidationResult {
	const n = typeof value === "number" ? value : Number(value);
	if (typeof value === "boolean" || Number.isNaN(n) || !Number.isFinite(n)) {
		return invalid(`"${field.name}" must be a number`);
	}
	const { min, max } = numberOptions(field);
	if (min !== undefined && n < min) return invalid(`"${field.name}" must be ≥ ${min}`);
	if (max !== undefined && n > max) return invalid(`"${field.name}" must be ≤ ${max}`);
	return VALID;
}

function validateBoolean(value: unknown, field: Field): ValidationResult {
	if (typeof value === "boolean") return VALID;
	if (value === "true" || value === "false") return VALID;
	return invalid(`"${field.name}" must be true or false`);
}

function validateInList(value: unknown, field: Field, allowed: string[]): ValidationResult {
	if (allowed.length === 0) return VALID; // unconstrained source
	return allowed.includes(String(value))
		? VALID
		: invalid(`"${String(value)}" is not an allowed value for "${field.name}"`);
}

const WIKILINK_RE = /^!?\[\[.+\]\]$/;

function validateDatePattern(value: unknown, field: Field, re: RegExp): ValidationResult {
	const s = String(value);
	// Insert-as-link stores the date as a wikilink; accept it as-is.
	if (WIKILINK_RE.test(s.trim())) return VALID;
	// A custom format can't be checked without a date library; accept non-empty.
	const hasCustomFormat =
		!Array.isArray(field.options) && typeof field.options.dateFormat === "string";
	if (hasCustomFormat) return VALID;
	return re.test(s) ? VALID : invalid(`"${field.name}" has an invalid format`);
}

/**
 * Validates a raw frontmatter `value` for `field`. `allowedValues` is required
 * only for list types (Select/Cycle/Multi); pass the resolved values or [].
 */
/** A field marked `required: true` in its options must have a value. */
export function isRequired(field: Field): boolean {
	return (
		!Array.isArray(field.options) &&
		(field.options.required === true || field.options.required === "true")
	);
}

export function validateField(
	field: Field,
	value: unknown,
	allowedValues: string[] = []
): ValidationResult {
	if (isEmpty(value)) return isRequired(field) ? invalid(`"${field.name}" is required`) : VALID;

	switch (field.type) {
		case "Input":
			return typeof value === "object"
				? invalid(`"${field.name}" must be text`)
				: VALID;
		case "MultiInput": {
			if (!Array.isArray(value)) return invalid(`"${field.name}" must be a list`);
			for (const item of value) {
				if (item !== null && typeof item === "object") {
					return invalid(`"${field.name}" items must be text`);
				}
			}
			return VALID;
		}
		case "Number":
			return validateNumber(value, field);
		case "Boolean":
			return validateBoolean(value, field);
		case "Select":
		case "Cycle":
			return validateInList(value, field, allowedValues);
		case "Multi": {
			if (!Array.isArray(value)) return invalid(`"${field.name}" must be a list`);
			for (const item of value) {
				const r = validateInList(item, field, allowedValues);
				if (!r.ok) return r;
			}
			return VALID;
		}
		case "File":
		case "Media":
			return typeof value === "string"
				? VALID
				: invalid(`"${field.name}" must be a link`);
		case "MultiFile":
		case "MultiMedia":
			return Array.isArray(value)
				? VALID
				: invalid(`"${field.name}" must be a list of links`);
		case "Duration":
			return isValidDuration(String(value))
				? VALID
				: invalid(`"${field.name}" must be a duration (e.g. P1W, PT1H30M)`);
		case "CycleDuration": {
			if (!Array.isArray(value)) return invalid(`"${field.name}" must be a list`);
			for (const item of value) {
				if (!isValidDuration(String(item))) {
					return invalid(`"${field.name}" items must be durations (e.g. P1W)`);
				}
			}
			return VALID;
		}
		case "Location":
			return isValidLocation(String(value))
				? VALID
				: invalid(`"${field.name}" must be "lat,lon" (lat −90..90, lon −180..180)`);
		case "Date":
			return validateDatePattern(value, field, DATE_RE);
		case "DateTime":
			return validateDatePattern(value, field, DATETIME_RE);
		case "Time":
			return validateDatePattern(value, field, TIME_RE);
		default:
			// Types handled in later waves are not constrained here.
			return VALID;
	}
}
