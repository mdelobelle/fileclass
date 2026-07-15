/*
 * Pure value validators for Wave A field types (ARCHITECTURE.md §7). No
 * Obsidian; fully unit-tested. Empty values (undefined/null/"") are always
 * valid — Fileclass fields are optional unless a later constraint says otherwise.
 *
 * Membership checks (Select/Cycle/Multi) take the already-resolved
 * `allowedValues` (see values.ts); an empty list means "unconstrained".
 */
import { Field, FieldType } from "../schema/field";
import { numberOptions } from "./options";

export interface ValidationResult {
	ok: boolean;
	message?: string;
}

export const VALID: ValidationResult = { ok: true };
export function invalid(message: string): ValidationResult {
	return { ok: false, message };
}

/** Types that store a list of values (Wave A subset). */
export const MULTI_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["Multi"]);

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

function validateDatePattern(value: unknown, field: Field, re: RegExp): ValidationResult {
	// A custom format can't be checked without a date library; accept non-empty.
	const hasCustomFormat =
		!Array.isArray(field.options) && typeof field.options.dateFormat === "string";
	if (hasCustomFormat) return VALID;
	return re.test(String(value)) ? VALID : invalid(`"${field.name}" has an invalid format`);
}

/**
 * Validates a raw frontmatter `value` for `field`. `allowedValues` is required
 * only for list types (Select/Cycle/Multi); pass the resolved values or [].
 */
export function validateField(
	field: Field,
	value: unknown,
	allowedValues: string[] = []
): ValidationResult {
	if (isEmpty(value)) return VALID;

	switch (field.type) {
		case "Input":
			return typeof value === "object"
				? invalid(`"${field.name}" must be text`)
				: VALID;
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
