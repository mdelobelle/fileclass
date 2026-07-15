/*
 * Typed accessors over the loosely-typed `Field.options` (ARCHITECTURE.md §7).
 * Pure — no Obsidian. The option shapes are Metadata Menu's (D3).
 */
import { Field, FieldOptions } from "../schema/field";

function asRecord(options: FieldOptions): Record<string, unknown> {
	return Array.isArray(options) ? {} : options;
}

function num(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

export interface NumberOptions {
	step?: number;
	min?: number;
	max?: number;
}

export function numberOptions(field: Field): NumberOptions {
	const o = asRecord(field.options);
	return { step: num(o.step), min: num(o.min), max: num(o.max) };
}

/** Source of a list field's allowed values (Metadata Menu's SourceType). */
export type ValuesSourceType = "ValuesList" | "ValuesListNotePath" | "ValuesFromDVQuery";

export interface ListOptions {
	sourceType: ValuesSourceType;
	/** Inline values, keyed by index ("1","2",…) as stored in frontmatter. */
	valuesList: Record<string, string>;
	/** Note whose non-empty lines are the values. */
	valuesListNotePath?: string;
}

export function listOptions(field: Field): ListOptions {
	// A bare array of options is treated as an inline values list.
	if (Array.isArray(field.options)) {
		const valuesList: Record<string, string> = {};
		field.options.forEach((v, i) => (valuesList[i + 1] = String(v)));
		return { sourceType: "ValuesList", valuesList };
	}
	const o = field.options;
	const rawList = (o.valuesList ?? {}) as Record<string, unknown>;
	const valuesList: Record<string, string> = {};
	for (const [k, v] of Object.entries(rawList)) valuesList[k] = String(v);
	const sourceType =
		o.sourceType === "ValuesListNotePath" || o.sourceType === "ValuesFromDVQuery"
			? (o.sourceType as ValuesSourceType)
			: "ValuesList";
	return {
		sourceType,
		valuesList,
		valuesListNotePath:
			typeof o.valuesListNotePath === "string" ? o.valuesListNotePath : undefined,
	};
}

export interface DateOptions {
	/** moment.js format; defaults per type when absent. */
	dateFormat?: string;
	defaultInsertAsLink?: boolean;
	dateLinkPath?: string;
}

export function dateOptions(field: Field): DateOptions {
	const o = asRecord(field.options);
	return {
		dateFormat: typeof o.dateFormat === "string" ? o.dateFormat : undefined,
		defaultInsertAsLink:
			o.defaultInsertAsLink === true || o.defaultInsertAsLink === "true",
		dateLinkPath: typeof o.dateLinkPath === "string" ? o.dateLinkPath : undefined,
	};
}
