/*
 * Pure conversion between a field's stored `options` and an editable draft used
 * by the per-type settings UI (ARCHITECTURE.md §20.3). No Obsidian. Types not
 * handled here (File/Media, Object/ObjectList) and unsupported list sources
 * return `undefined` from `buildFieldOptions`, so the caller leaves the existing
 * options untouched (no clobbering — D5-style safety).
 */
import { FieldOptions, FieldType } from "../schema/field";
import { CanvasDirection } from "./canvas/canvasGraph";
import { baseBindingOptionsFromOptions, listOptionsFromOptions } from "./options";

const CANVAS_DIRECTIONS: CanvasDirection[] = ["incoming", "outgoing", "bothsides"];

function strArr(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const list = value.filter((v): v is string => typeof v === "string");
	return list.length ? list : undefined;
}

export interface OptionsDraft {
	// Number
	step?: string;
	min?: string;
	max?: string;
	// Date / DateTime / Time
	dateFormat?: string;
	defaultInsertAsLink?: boolean;
	dateLinkPath?: string;
	/** Date/DateTime: name of a Duration/CycleDuration field for "Set next date". */
	nextIntervalField?: string;
	// Input
	/** Input `template` option (#27): guided composed value with placeholders. */
	template?: string;
	/** Original Input options, so unknown keys survive a template edit. */
	inputRawOptions?: Record<string, unknown>;
	// Duration / CycleDuration
	/** Preset durations (ISO strings) offered as quick picks at value entry (#30). */
	durationPresets?: string[];
	/** Original Duration options, so unknown keys survive an edit. */
	durationRawOptions?: Record<string, unknown>;
	// Icon
	/** Icon bank the picker offers (#32); default "lucide". */
	iconSource?: string;
	/** Original Icon options, so unknown keys survive an edit. */
	iconRawOptions?: Record<string, unknown>;
	// Object / ObjectList
	displayTemplate?: string;
	/** Original options, so unknown keys survive a template edit. */
	objectRawOptions?: Record<string, unknown>;
	// Canvas / CanvasGroup / CanvasGroupLink
	canvasPath?: string;
	canvasDirection?: CanvasDirection;
	edgeColors?: string[];
	edgeFromSides?: string[];
	edgeToSides?: string[];
	edgeLabels?: string[];
	nodeColors?: string[];
	groupColors?: string[];
	groupLabels?: string[];
	/** Original options, so genuinely-unknown keys survive an edit. */
	canvasRawOptions?: Record<string, unknown>;
	// Select / Cycle / Multi — undefined sourceType means an unsupported source
	// (legacy dataview), left untouched by this editor.
	sourceType?: "ValuesList" | "ValuesListNotePath" | "ValuesFromBase";
	values?: string[];
	valuesListNotePath?: string;
	// File / MultiFile / Media / MultiMedia (and base value sources)
	baseFile?: string;
	viewName?: string;
	displayColumn?: string;
	/** Column whose values feed a Select/Multi list (ValuesFromBase). */
	valuesColumn?: string;
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
		case "Input":
		case "MultiInput":
			return {
				template: typeof o.template === "string" ? o.template : "",
				inputRawOptions: Array.isArray(options) ? {} : { ...o },
			};
		case "Duration":
		case "CycleDuration":
			return {
				durationPresets: Array.isArray(o.presets)
					? o.presets.filter((v): v is string => typeof v === "string")
					: [],
				durationRawOptions: Array.isArray(options) ? {} : { ...o },
			};
		case "Icon":
			return {
				iconSource: typeof o.iconSource === "string" ? o.iconSource : "lucide",
				iconRawOptions: Array.isArray(options) ? {} : { ...o },
			};
		case "Number":
			return { step: numStr(o.step), min: numStr(o.min), max: numStr(o.max) };
		case "Date":
		case "DateTime":
		case "Time":
			return {
				dateFormat: typeof o.dateFormat === "string" ? o.dateFormat : "",
				defaultInsertAsLink: o.defaultInsertAsLink === true || o.defaultInsertAsLink === "true",
				dateLinkPath: typeof o.dateLinkPath === "string" ? o.dateLinkPath : "",
				nextIntervalField: typeof o.nextIntervalField === "string" ? o.nextIntervalField : "",
			};
		case "Object":
		case "ObjectList":
			return {
				displayTemplate: typeof o.displayTemplate === "string" ? o.displayTemplate : "",
				objectRawOptions: Array.isArray(options) ? {} : { ...o },
			};
		case "Canvas":
		case "CanvasGroup":
		case "CanvasGroupLink":
			return {
				canvasPath: typeof o.canvasPath === "string" ? o.canvasPath : "",
				canvasDirection: CANVAS_DIRECTIONS.includes(o.direction as CanvasDirection)
					? (o.direction as CanvasDirection)
					: "bothsides",
				edgeColors: strArr(o.edgeColors),
				edgeFromSides: strArr(o.edgeFromSides),
				edgeToSides: strArr(o.edgeToSides),
				edgeLabels: strArr(o.edgeLabels),
				nodeColors: strArr(o.nodeColors),
				groupColors: strArr(o.groupColors),
				groupLabels: strArr(o.groupLabels),
				baseFile: typeof o.baseFile === "string" ? o.baseFile : "",
				viewName: typeof o.viewName === "string" ? o.viewName : "",
				canvasRawOptions: Array.isArray(options) ? {} : { ...o },
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
					valuesColumn: lo.valuesColumn ?? "",
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
		case "Input":
		case "MultiInput": {
			// Preserve any unknown option keys (e.g. required); only manage template.
			const o = { ...(draft.inputRawOptions ?? {}) };
			delete o.template;
			const tpl = draft.template?.trim();
			if (tpl) o.template = tpl;
			return o;
		}
		case "Duration":
		case "CycleDuration": {
			// Preserve any unknown option keys; only manage the presets list.
			const o = { ...(draft.durationRawOptions ?? {}) };
			delete o.presets;
			const presets = (draft.durationPresets ?? []).filter((p) => p.trim() !== "");
			if (presets.length) o.presets = presets;
			return o;
		}
		case "Icon": {
			// Preserve any unknown option keys; only manage iconSource (omit default).
			const o = { ...(draft.iconRawOptions ?? {}) };
			delete o.iconSource;
			const src = draft.iconSource?.trim();
			if (src && src !== "lucide") o.iconSource = src;
			return o;
		}
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
			if (draft.dateLinkPath?.trim()) o.dateLinkPath = draft.dateLinkPath.trim();
			if (type !== "Time" && draft.nextIntervalField?.trim()) {
				o.nextIntervalField = draft.nextIntervalField.trim();
			}
			return o;
		}
		case "Object":
		case "ObjectList": {
			// Preserve any unknown option keys; only manage displayTemplate.
			const o = { ...(draft.objectRawOptions ?? {}) };
			delete o.displayTemplate;
			const tpl = draft.displayTemplate?.trim();
			if (tpl) o.displayTemplate = tpl;
			return o;
		}
		case "Canvas":
		case "CanvasGroup":
		case "CanvasGroupLink": {
			// Preserve genuinely-unknown keys; manage path/direction/filters.
			const o = { ...(draft.canvasRawOptions ?? {}) };
			const setArr = (key: string, arr?: string[]) => {
				if (arr && arr.length) o[key] = arr;
				else delete o[key];
			};
			if (draft.canvasPath?.trim()) o.canvasPath = draft.canvasPath.trim();
			else delete o.canvasPath;

			const hasEdges = type !== "CanvasGroup";
			const hasGroups = type !== "Canvas";
			const hasLinks = type !== "CanvasGroup";

			if (hasEdges) o.direction = draft.canvasDirection ?? "bothsides";
			else delete o.direction;

			setArr("edgeColors", hasEdges ? draft.edgeColors : undefined);
			setArr("edgeFromSides", hasEdges ? draft.edgeFromSides : undefined);
			setArr("edgeToSides", hasEdges ? draft.edgeToSides : undefined);
			setArr("edgeLabels", hasEdges ? draft.edgeLabels : undefined);
			setArr("nodeColors", hasEdges ? draft.nodeColors : undefined);
			setArr("groupColors", hasGroups ? draft.groupColors : undefined);
			setArr("groupLabels", hasGroups ? draft.groupLabels : undefined);

			// Matching-files base view (link-producing types only).
			if (hasLinks && draft.baseFile?.trim()) o.baseFile = draft.baseFile.trim();
			else delete o.baseFile;
			if (hasLinks && draft.viewName?.trim()) o.viewName = draft.viewName.trim();
			else delete o.viewName;
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
				const o: Record<string, unknown> = {
					sourceType: "ValuesFromBase",
					baseFile: draft.baseFile?.trim() ?? "",
					viewName: draft.viewName?.trim() ?? "",
				};
				if (draft.valuesColumn?.trim()) o.valuesColumn = draft.valuesColumn.trim();
				return o;
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
