/*
 * Wires field types to their input UI and the write path (ARCHITECTURE.md §7,
 * D5). `updateField` opens the right modal, validates, and performs a single
 * frontmatter write. This is the Wave A dispatcher; Object/ObjectList editing
 * (Wave C) and File/Media suggesters (Wave B) plug in here later.
 */
import { App, Notice, TFile } from "obsidian";

import { readFieldValue } from "../io/read";
import { writeFieldValue } from "../io/write";
import { Field, FieldType } from "../schema/field";
import { displayValue } from "./display";
import { ChoiceSuggestModal, MultiSelectModal, PromptModal } from "./input/valueModals";
import { resolveFieldValues } from "./valuesIo";
import { validateField } from "./validate";

/** Field types with input support in this wave. */
export const WAVE_A_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
	"Input",
	"Number",
	"Boolean",
	"Select",
	"Cycle",
	"Multi",
	"Date",
	"DateTime",
	"Time",
]);

export function isInputSupported(type: FieldType): boolean {
	return WAVE_A_TYPES.has(type);
}

/** Value written when a field is inserted empty (insert-missing-fields). */
export function defaultValueFor(field: Field): unknown {
	switch (field.type) {
		case "Object":
			return {};
		case "Multi":
		case "MultiFile":
		case "MultiMedia":
		case "ObjectList":
			return [];
		default:
			return "";
	}
}

function placeholderFor(field: Field): string {
	switch (field.type) {
		case "Date":
			return "YYYY-MM-DD";
		case "DateTime":
			return "YYYY-MM-DDTHH:mm";
		case "Time":
			return "HH:mm";
		case "Number":
			return "number";
		default:
			return "";
	}
}

/** Coerces a text-input string to the stored value type. */
function coerceInput(field: Field, raw: string): unknown {
	if (field.type === "Number") {
		const t = raw.trim();
		if (t === "") return "";
		const n = Number(t);
		return Number.isFinite(n) ? n : t; // non-numeric passes through to fail validation
	}
	return raw;
}

async function commit(app: App, file: TFile, field: Field, value: unknown): Promise<void> {
	const result = validateField(field, value);
	if (!result.ok) {
		new Notice(`Fileclass: ${result.message}`);
		return;
	}
	try {
		await writeFieldValue(app, file, field, value);
	} catch (err) {
		new Notice(`Fileclass: could not write "${field.name}" (${(err as Error).message}).`);
	}
}

function openTextPrompt(app: App, file: TFile, field: Field, current: unknown): void {
	new PromptModal(app, {
		title: `Set ${field.name}`,
		initial: current == null ? "" : String(current),
		placeholder: placeholderFor(field),
		validate: (v) => validateField(field, coerceInput(field, v)),
		onSubmit: (v) => void commit(app, file, field, coerceInput(field, v)),
	}).open();
}

/** Opens the appropriate input UI for a field and writes the chosen value. */
export async function updateField(app: App, file: TFile, field: Field): Promise<void> {
	const current = readFieldValue(app, file, field);

	switch (field.type) {
		case "Boolean":
			new ChoiceSuggestModal<boolean>(
				app,
				[true, false],
				(b) => (b ? "true" : "false"),
				(b) => void commit(app, file, field, b),
				"Set true or false"
			).open();
			return;

		case "Select":
		case "Cycle": {
			const allowed = await resolveFieldValues(app, field);
			if (allowed.length === 0) return openTextPrompt(app, file, field, current);
			new ChoiceSuggestModal<string>(
				app,
				allowed,
				(s) => s,
				(s) => void commit(app, file, field, s),
				`Set ${field.name}`
			).open();
			return;
		}

		case "Multi": {
			const allowed = await resolveFieldValues(app, field);
			const selected = Array.isArray(current)
				? current.map(String)
				: current != null && current !== ""
					? [String(current)]
					: [];
			if (allowed.length === 0) {
				new PromptModal(app, {
					title: `Set ${field.name}`,
					initial: selected.join(", "),
					placeholder: "comma, separated, values",
					onSubmit: (v) =>
						void commit(
							app,
							file,
							field,
							v.split(",").map((s) => s.trim()).filter(Boolean)
						),
				}).open();
				return;
			}
			new MultiSelectModal(app, {
				title: `Set ${field.name}`,
				allowed,
				selected,
				onSubmit: (vals) => void commit(app, file, field, vals),
			}).open();
			return;
		}

		default:
			openTextPrompt(app, file, field, current);
	}
}

/** Removes a field's key from the note (single write). */
export function clearField(app: App, file: TFile, field: Field): Promise<void> {
	return writeFieldValue(app, file, field, undefined);
}

/** Lets the user pick one of a note's fields, then edits it. */
export function pickAndUpdateField(app: App, file: TFile, fields: Field[]): void {
	if (!fields.length) {
		new Notice("Fileclass: no fields apply to this note.");
		return;
	}
	new ChoiceSuggestModal<Field>(
		app,
		fields,
		(f) => {
			const value = displayValue(f, readFieldValue(app, file, f));
			return value ? `${f.name}: ${value}` : f.name;
		},
		(f) => void updateField(app, file, f),
		"Select a field to update"
	).open();
}
