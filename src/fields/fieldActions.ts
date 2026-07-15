/*
 * Wires field types to their input UI and the write path (ARCHITECTURE.md §7,
 * D5). `updateField` opens the right modal, validates, and performs a single
 * frontmatter write. Covers Wave A (scalars/lists) and Wave B (File/Media links
 * with Base-view candidates). Object/ObjectList editing (Wave C) plugs in here.
 */
import { App, Notice, TFile } from "obsidian";

import { readFieldValue } from "../io/read";
import { writeFieldValue } from "../io/write";
import { Field, FieldType } from "../schema/field";
import { AdapterHost, Candidate, isMediaType, resolveCandidates } from "./candidates";
import { displayValue } from "./display";
import { ChoiceSuggestModal, MultiSelectModal, PromptModal } from "./input/valueModals";
import { formatLink, linkTargetPath } from "./links";
import { baseBindingOptions } from "./options";
import { resolveFieldValues } from "./valuesIo";
import { validateField } from "./validate";

/** Types edited through a single-line text prompt. */
const TEXT_INPUT_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
	"Input",
	"Number",
	"Date",
	"DateTime",
	"Time",
]);

/** All field types with input support so far (waves A + B). */
export const SUPPORTED_INPUT_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
	...TEXT_INPUT_TYPES,
	"Boolean",
	"Select",
	"Cycle",
	"Multi",
	"File",
	"MultiFile",
	"Media",
	"MultiMedia",
]);

export function isInputSupported(type: FieldType): boolean {
	return SUPPORTED_INPUT_TYPES.has(type);
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

function aliasFor(candidate: Candidate): string | undefined {
	return candidate.display && candidate.display !== candidate.file.basename
		? candidate.display
		: undefined;
}

/** File/Media: pick one candidate; store its link. */
async function openLinkInput(host: AdapterHost, file: TFile, field: Field): Promise<void> {
	const app = host.app;
	const embed = isMediaType(field.type) && baseBindingOptions(field).embed;
	const candidates = await resolveCandidates(host, field, file);
	new ChoiceSuggestModal<Candidate>(
		app,
		candidates,
		(c) => c.display,
		(c) => void commit(app, file, field, formatLink(app, c.file, file.path, aliasFor(c), embed)),
		`Set ${field.name}`
	).open();
}

/** MultiFile/MultiMedia: toggle candidates; store the selected links. */
async function openMultiLinkInput(host: AdapterHost, file: TFile, field: Field): Promise<void> {
	const app = host.app;
	const embed = isMediaType(field.type) && baseBindingOptions(field).embed;
	const candidates = await resolveCandidates(host, field, file);
	const byDisplay = new Map(candidates.map((c) => [c.display, c] as const));

	const currentRaw = readFieldValue(app, file, field);
	const currentArr = Array.isArray(currentRaw)
		? currentRaw
		: currentRaw != null && currentRaw !== ""
			? [currentRaw]
			: [];
	const currentPaths = new Set(
		currentArr.map((v) => linkTargetPath(app, v, file.path)).filter((p): p is string => !!p)
	);
	const selected = candidates.filter((c) => currentPaths.has(c.file.path)).map((c) => c.display);

	new MultiSelectModal(app, {
		title: `Set ${field.name}`,
		allowed: candidates.map((c) => c.display),
		selected,
		onSubmit: (displays) => {
			const values = displays
				.map((d) => byDisplay.get(d))
				.filter((c): c is Candidate => !!c)
				.map((c) => formatLink(app, c.file, file.path, aliasFor(c), embed));
			void commit(app, file, field, values);
		},
	}).open();
}

/** Opens the appropriate input UI for a field and writes the chosen value. */
export async function updateField(host: AdapterHost, file: TFile, field: Field): Promise<void> {
	const app = host.app;
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

		case "File":
		case "Media":
			return openLinkInput(host, file, field);

		case "MultiFile":
		case "MultiMedia":
			return openMultiLinkInput(host, file, field);

		default:
			if (TEXT_INPUT_TYPES.has(field.type)) openTextPrompt(app, file, field, current);
			else new Notice(`Fileclass: "${field.type}" fields aren't editable yet.`);
	}
}

/** Removes a field's key from the note (single write). */
export function clearField(app: App, file: TFile, field: Field): Promise<void> {
	return writeFieldValue(app, file, field, undefined);
}

/** Lets the user pick one of a note's editable fields, then edits it. */
export function pickAndUpdateField(host: AdapterHost, file: TFile, fields: Field[]): void {
	const editable = fields.filter((f) => isInputSupported(f.type));
	if (!editable.length) {
		new Notice("Fileclass: no editable fields apply to this note.");
		return;
	}
	new ChoiceSuggestModal<Field>(
		host.app,
		editable,
		(f) => {
			const value = displayValue(f, readFieldValue(host.app, file, f));
			return value ? `${f.name}: ${value}` : f.name;
		},
		(f) => void updateField(host, file, f),
		"Select a field to update"
	).open();
}
