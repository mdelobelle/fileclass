/*
 * Pure conversion between a field's stored `options` and an editable draft used
 * by the per-type settings UI (ARCHITECTURE.md §20.3). No Obsidian. Types not
 * handled here (File/Media, Object/ObjectList) and unsupported list sources
 * return `undefined` from `buildFieldOptions`, so the caller leaves the existing
 * options untouched (no clobbering — D5-style safety).
 */
import { FieldOptions, FieldType } from "../schema/field";
import { baseBindingOptionsFromOptions, listOptionsFromOptions } from "./options";

export interface OptionsDraft {
	// Number
	step?: string;
	min?: string;
	max?: string;
	// Date / DateTime / Time
	dateFormat?: string;
	defaultInsertAsLink?: boolean;
	// Select / Cycle / Multi — undefined sourceType means an unsupported source
	// (legacy dataview), left untouched by this editor.
	sourceType?: "ValuesList" | "ValuesListNotePath" | "ValuesFromBase";
	values?: string[];
	valuesListNotePath?: string;
	// File / MultiFile / Media / MultiMedia
	baseFile?: string;
	viewName?: string;
	displayColumn?: string;
	embed?: boolean;
}

const LINK_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
	"File",
	"MultiFile",
	"Media",
	"MultiMedia",
]);
const MEDIA_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(["Media", "MultiMedia"]);

const numStr = (v: unknown): string =>
	typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? String(v) : "";

function numOrUndef(s?: string): number | undefined {
	if (!s || !s.trim()) return undefined;
	const n = Number(s);
	return Number.isFinite(n) ? n : undefined;
}

function valuesToRecord(values: string[]): Record<string, string> {
	const record: Record<string, string> = {};
	let i = 1;
	for (const v of values) if (v.trim() !== "") record[String(i++)] = v;
	return record;
}

/** Reads a field's stored options into an editable draft. */
export function optionsToDraft(type: FieldType, options: FieldOptions): OptionsDraft {
	const o = Array.isArray(options) ? ({} as Record<string, unknown>) : options;
	switch (type) {
		case "Number":
			return { step: numStr(o.step), min: numStr(o.min), max: numStr(o.max) };
		case "Date":
		case "DateTime":
		case "Time":
			return {
				dateFormat: typeof o.dateFormat === "string" ? o.dateFormat : "",
				defaultInsertAsLink: o.defaultInsertAsLink === true || o.defaultInsertAsLink === "true",
			};
		case "Select":
		case "Cycle":
		case "Multi": {
			const lo = listOptionsFromOptions(options);
			if (lo.sourceType === "ValuesListNotePath") {
				return { sourceType: "ValuesListNotePath", valuesListNotePath: lo.valuesListNotePath ?? "" };
			}
			if (lo.sourceType === "ValuesFromBase") {
				return {
					sourceType: "ValuesFromBase",
					baseFile: lo.baseFile ?? "",
					viewName: lo.viewName ?? "",
				};
			}
			if (lo.sourceType === "ValuesList") {
				return { sourceType: "ValuesList", values: Object.values(lo.valuesList) };
			}
			return {}; // legacy dataview source — unsupported here, sourceType undefined
		}
		default:
			if (LINK_TYPES.has(type)) {
				const b = baseBindingOptionsFromOptions(options);
				return {
					baseFile: b.baseFile ?? "",
					viewName: b.viewName ?? "",
					displayColumn: b.displayColumn ?? "",
					embed: b.embed,
				};
			}
			return {};
	}
}

/**
 * Builds the options to store from a draft, or `undefined` when this editor does
 * not manage the type's options (so the caller preserves the existing ones).
 */
export function buildFieldOptions(type: FieldType, draft: OptionsDraft): FieldOptions | undefined {
	switch (type) {
		case "Number": {
			const o: Record<string, number> = {};
			const step = numOrUndef(draft.step);
			const min = numOrUndef(draft.min);
			const max = numOrUndef(draft.max);
			if (step !== undefined) o.step = step;
			if (min !== undefined) o.min = min;
			if (max !== undefined) o.max = max;
			return o;
		}
		case "Date":
		case "DateTime":
		case "Time": {
			const o: Record<string, unknown> = {};
			if (draft.dateFormat?.trim()) o.dateFormat = draft.dateFormat.trim();
			if (draft.defaultInsertAsLink) o.defaultInsertAsLink = true;
			return o;
		}
		case "Select":
		case "Cycle":
		case "Multi": {
			if (draft.sourceType === "ValuesListNotePath") {
				return {
					sourceType: "ValuesListNotePath",
					valuesListNotePath: draft.valuesListNotePath?.trim() ?? "",
				};
			}
			if (draft.sourceType === "ValuesFromBase") {
				return {
					sourceType: "ValuesFromBase",
					baseFile: draft.baseFile?.trim() ?? "",
					viewName: draft.viewName?.trim() ?? "",
				};
			}
			if (draft.sourceType === "ValuesList") {
				return { sourceType: "ValuesList", valuesList: valuesToRecord(draft.values ?? []) };
			}
			return undefined; // unsupported source → preserve existing
		}
		default: {
			if (!LINK_TYPES.has(type)) return undefined; // Object/Boolean/Input → preserve
			const o: Record<string, unknown> = {};
			if (draft.baseFile?.trim()) o.baseFile = draft.baseFile.trim();
			if (draft.viewName?.trim()) o.viewName = draft.viewName.trim();
			if (draft.displayColumn?.trim()) o.displayColumn = draft.displayColumn.trim();
			if (MEDIA_TYPES.has(type) && draft.embed) o.embed = true;
			return o;
		}
	}
}
