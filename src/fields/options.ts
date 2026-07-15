/*
 * Typed accessors over the loosely-typed `Field.options` (ARCHITECTURE.md §7).
 * Pure — no Obsidian. The option shapes are Metadata Menu's (D3).
 */
import { LOOKUP_OUTPUT_TYPES, LookupOutputType } from "../computed/lookup";
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

/**
 * Source of a list field's allowed values. `ValuesFromBase` (a `.base` view)
 * replaces Metadata Menu's dataview source (`ValuesFromDVQuery`, kept only to
 * recognize legacy fileClasses).
 */
export type ValuesSourceType =
	| "ValuesList"
	| "ValuesListNotePath"
	| "ValuesFromBase"
	| "ValuesFromDVQuery";

export interface ListOptions {
	sourceType: ValuesSourceType;
	/** Inline values, keyed by index ("1","2",…) as stored in frontmatter. */
	valuesList: Record<string, string>;
	/** Note whose non-empty lines are the values. */
	valuesListNotePath?: string;
	/** Base view providing the values (sourceType `ValuesFromBase`). */
	baseFile?: string;
	viewName?: string;
}

export function listOptions(field: Field): ListOptions {
	return listOptionsFromOptions(field.options);
}

export function listOptionsFromOptions(options: FieldOptions): ListOptions {
	// A bare array of options is treated as an inline values list.
	if (Array.isArray(options)) {
		const valuesList: Record<string, string> = {};
		options.forEach((v, i) => (valuesList[i + 1] = String(v)));
		return { sourceType: "ValuesList", valuesList };
	}
	const o = options;
	// Legacy shape: the options object *is* the values list (index → value),
	// with no `valuesList`/`sourceType` wrapper (e.g. `{ "1": "🟢", "2": "🟡" }`).
	if (!("sourceType" in o) && !("valuesList" in o)) {
		const valuesList: Record<string, string> = {};
		for (const [k, v] of Object.entries(o)) valuesList[k] = String(v);
		return { sourceType: "ValuesList", valuesList };
	}
	const rawList = (o.valuesList ?? {}) as Record<string, unknown>;
	const valuesList: Record<string, string> = {};
	for (const [k, v] of Object.entries(rawList)) valuesList[k] = String(v);
	const known: ValuesSourceType[] = ["ValuesListNotePath", "ValuesFromBase", "ValuesFromDVQuery"];
	const sourceType = known.includes(o.sourceType as ValuesSourceType)
		? (o.sourceType as ValuesSourceType)
		: "ValuesList";
	return {
		sourceType,
		valuesList,
		valuesListNotePath:
			typeof o.valuesListNotePath === "string" ? o.valuesListNotePath : undefined,
		baseFile: typeof o.baseFile === "string" && o.baseFile ? o.baseFile : undefined,
		viewName: typeof o.viewName === "string" && o.viewName ? o.viewName : undefined,
	};
}

/**
 * Options for link-type fields (File/MultiFile/Media/MultiMedia). Candidates
 * come from a Base view (`baseFile` + `viewName`), replacing Metadata Menu's
 * `dvQueryString` and Media `folders` (ARCHITECTURE.md §5, §7). `displayColumn`
 * (a base column identifier) replaces MDM's `customRendering` alias function.
 */
export interface BaseBindingOptions {
	baseFile?: string;
	viewName?: string;
	/** Base column id used as the suggestion's display/alias (e.g. "note.title"). */
	displayColumn?: string;
	/** Media only: store the value as an embed (`![[…]]`) rather than a link. */
	embed: boolean;
}

export function baseBindingOptions(field: Field): BaseBindingOptions {
	return baseBindingOptionsFromOptions(field.options);
}

export function baseBindingOptionsFromOptions(options: FieldOptions): BaseBindingOptions {
	const o = asRecord(options);
	return {
		baseFile: typeof o.baseFile === "string" && o.baseFile ? o.baseFile : undefined,
		viewName: typeof o.viewName === "string" && o.viewName ? o.viewName : undefined,
		displayColumn:
			typeof o.displayColumn === "string" && o.displayColumn ? o.displayColumn : undefined,
		embed: o.embed === true || o.embed === "true",
	};
}

/** Options for a Lookup field (ARCHITECTURE.md §9). */
export interface LookupOptions {
	baseFile?: string;
	viewName?: string;
	/** Field on the source notes that links back to the host. */
	targetFieldName?: string;
	outputType: LookupOutputType;
	/** Numeric field summarized by Sum/Average/Max/Min/Count. */
	summarizedFieldName?: string;
}

export function lookupOptions(field: Field): LookupOptions {
	return lookupOptionsFromOptions(field.options);
}

export function lookupOptionsFromOptions(options: FieldOptions): LookupOptions {
	const o = asRecord(options);
	const outputType = LOOKUP_OUTPUT_TYPES.includes(o.outputType as LookupOutputType)
		? (o.outputType as LookupOutputType)
		: "LinksList";
	const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
	return {
		baseFile: str(o.baseFile),
		viewName: str(o.viewName),
		targetFieldName: str(o.targetFieldName),
		outputType,
		summarizedFieldName: str(o.summarizedFieldName),
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
