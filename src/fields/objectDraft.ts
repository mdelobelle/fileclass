/*
 * Pure helpers for the Object/ObjectList draft editor (ARCHITECTURE.md §8, D5).
 * No Obsidian. The editor clones the user's existing value, mutates the clone,
 * validates the whole draft, then writes it in one processFrontMatter call.
 * Cloning the *existing* object (never regenerating from the schema) preserves
 * unknown keys.
 */
import { Field } from "../schema/field";
import { displayValue } from "./display";
import { validateField } from "./validate";

/** Deep-clones a draft value (structuredClone when available). */
export function cloneDraft<T>(value: T): T {
	if (typeof structuredClone === "function") return structuredClone(value);
	return JSON.parse(JSON.stringify(value ?? null));
}

/**
 * Validates every known child of an object draft. List-membership (Select/Multi)
 * is not enforced here — the picker constrains those; only type/format is
 * checked. Returns the first error message, or undefined when valid.
 */
export function validateObjectDraft(
	childFields: Field[],
	object: Record<string, unknown>
): string | undefined {
	for (const child of childFields) {
		const result = validateField(child, object[child.name]);
		if (!result.ok) return result.message;
	}
	return undefined;
}

/** A one-line summary of an object (its first non-empty child value). */
export function childSummary(childFields: Field[], object: Record<string, unknown>): string {
	for (const child of childFields) {
		const text = displayValue(child, object[child.name]);
		if (text) return text;
	}
	return "(empty)";
}

/** Narrows an unknown draft value to a plain object (for Object fields). */
export function asObjectValue(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** Narrows an unknown draft value to an array (for ObjectList fields). */
export function asListValue(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
