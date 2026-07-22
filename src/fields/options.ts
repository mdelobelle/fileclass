/*
 * Typed accessors over the loosely-typed `Field.options` (ARCHITECTURE.md §7).
 * Pure — no Obsidian. The option shapes are Metadata Menu's (D3).
 */
import {
	CanvasDirection,
	CanvasGroupOptions,
	CanvasLinkOptions,
} from "./canvas/canvasGraph";
import { Field, FieldOptions } from "../schema/field";

function asRecord(options: FieldOptions): Record<string, unknown> {
	return Array.isArray(options) ? {} : options;
}

function strArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const list = value.filter((v): v is string => typeof v === "string");
	return list.length ? list : undefined;
}

const CANVAS_DIRECTIONS: CanvasDirection[] = ["incoming", "outgoing", "bothsides"];

export interface CanvasOptions extends CanvasLinkOptions, CanvasGroupOptions {
	/** Path of the `.canvas` file this field derives from. */
	canvasPath: string;
	/** Optional `.base` file + view restricting target files (matching files). */
	matchingFilesBase?: string;
	matchingFilesView?: string;
}

/** Options for the Canvas field family (canvasPath + direction + filters). */
export function canvasOptions(field: Field): CanvasOptions {
	const o = asRecord(field.options);
	const direction = CANVAS_DIRECTIONS.includes(o.direction as CanvasDirection)
		? (o.direction as CanvasDirection)
		: "bothsides";
	return {
		canvasPath: typeof o.canvasPath === "string" ? o.canvasPath : "",
		direction,
		nodeColors: strArray(o.nodeColors),
		edgeColors: strArray(o.edgeColors),
		edgeFromSides: strArray(o.edgeFromSides),
		edgeToSides: strArray(o.edgeToSides),
		edgeLabels: strArray(o.edgeLabels),
		groupColors: strArray(o.groupColors),
		groupLabels: strArray(o.groupLabels),
		matchingFilesBase: typeof o.baseFile === "string" ? o.baseFile : undefined,
		matchingFilesView: typeof o.viewName === "string" ? o.viewName : undefined,
	};
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
	/** Column id whose values are the list (blank = the files' names). */
	valuesColumn?: string;
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
		valuesColumn:
			typeof o.valuesColumn === "string" && o.valuesColumn ? o.valuesColumn : undefined,
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

/**
 * The `template` option of an Input field (#27), or undefined when unset/blank.
 * Presence switches the value input from a plain prompt to the guided template
 * form (see `inputTemplate.ts`).
 */
export function inputTemplate(field: Field): string | undefined {
	const o = asRecord(field.options);
	return typeof o.template === "string" && o.template.trim() ? o.template : undefined;
}

/**
 * Preset durations offered as quick picks when entering a Duration/CycleDuration
 * value (#30). Stored as an array of ISO 8601 duration strings in `options.presets`.
 */
export function durationPresets(field: Field): string[] {
	const o = asRecord(field.options);
	return Array.isArray(o.presets)
		? o.presets.filter((v): v is string => typeof v === "string" && v.trim() !== "")
		: [];
}

/** The Icon field's `iconSource` option (which bank the picker offers); default "lucide". */
export function iconSource(field: Field): string {
	const o = asRecord(field.options);
	return typeof o.iconSource === "string" && o.iconSource ? o.iconSource : "lucide";
}

/** The Color field's `colorSource` option (which palette the picker offers); default "canvas". */
export function colorSource(field: Field): string {
	const o = asRecord(field.options);
	return typeof o.colorSource === "string" && o.colorSource ? o.colorSource : "canvas";
}

export interface DateOptions {
	/** moment.js format; defaults per type when absent. */
	dateFormat?: string;
	defaultInsertAsLink?: boolean;
	dateLinkPath?: string;
	/**
	 * Name of a Duration/CycleDuration field in the same fileClass (#30). When set,
	 * the date editor gets a "Set next date" button advancing this date by that
	 * field's (head) interval — and rotating the list for CycleDuration.
	 */
	nextIntervalField?: string;
}

export function dateOptions(field: Field): DateOptions {
	const o = asRecord(field.options);
	return {
		dateFormat: typeof o.dateFormat === "string" ? o.dateFormat : undefined,
		defaultInsertAsLink:
			o.defaultInsertAsLink === true || o.defaultInsertAsLink === "true",
		dateLinkPath: typeof o.dateLinkPath === "string" ? o.dateLinkPath : undefined,
		nextIntervalField:
			typeof o.nextIntervalField === "string" && o.nextIntervalField
				? o.nextIntervalField
				: undefined,
	};
}
