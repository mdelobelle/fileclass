/*
 * Lookup computation (ARCHITECTURE.md §9). Pure — given the source rows already
 * resolved for a host, produce the persisted value. Output types port Metadata
 * Menu's (`LinksList`, built-in summarizing); custom JS functions are deferred.
 * The Obsidian side (lookupRecalc.ts) runs the query and writes the result.
 */

export type LookupOutputType =
	| "LinksList"
	| "Count"
	| "CountAll"
	| "Sum"
	| "Average"
	| "Max"
	| "Min";

export const LOOKUP_OUTPUT_TYPES: LookupOutputType[] = [
	"LinksList",
	"CountAll",
	"Count",
	"Sum",
	"Average",
	"Max",
	"Min",
];

/** True for outputs that summarize a numeric `summarizedFieldName`. */
export function isSummarizing(type: LookupOutputType): boolean {
	return type === "Sum" || type === "Average" || type === "Max" || type === "Min" || type === "Count";
}

/** A source note related to the host, with its summarized value resolved. */
export interface LookupSource {
	basename: string;
	/** Numeric value of the summarized field, if any / parseable. */
	summarized?: number;
}

/**
 * Computes a lookup's persisted value from the sources related to one host.
 * `LinksList` yields an array of `[[link]]` strings; summarizing yields a number
 * (or "" when there is nothing to summarize).
 */
export function computeLookupValue(
	outputType: LookupOutputType,
	sources: LookupSource[]
): unknown {
	switch (outputType) {
		case "LinksList":
			return sources.map((s) => `[[${s.basename}]]`);
		case "CountAll":
			return sources.length;
		case "Count":
			return sources.filter((s) => s.summarized !== undefined).length;
		case "Sum":
			return sources.reduce((acc, s) => acc + (s.summarized ?? 0), 0);
		case "Average": {
			const nums = sources.map((s) => s.summarized).filter((n): n is number => n !== undefined);
			return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : "";
		}
		case "Max": {
			const nums = sources.map((s) => s.summarized).filter((n): n is number => n !== undefined);
			return nums.length ? Math.max(...nums) : "";
		}
		case "Min": {
			const nums = sources.map((s) => s.summarized).filter((n): n is number => n !== undefined);
			return nums.length ? Math.min(...nums) : "";
		}
		default:
			return "";
	}
}
