/*
 * Wires field types to their input UI and the write path (ARCHITECTURE.md §7,
 * §8, D5). `promptFieldValue` is the universal, recursive dispatcher: it opens
 * the right input for a field and calls back with the chosen value **without
 * writing** (Object/ObjectList recurse into the draft editor). `updateField`
 * wraps it to perform the single frontmatter write. Values flow up to the
 * top-level (root) field, so a nested object subtree is written in one call.
 */
import { App, Notice, TFile } from "obsidian";

import { readFieldValue } from "../io/read";
import { writeFieldValue } from "../io/write";
import { childFieldsOf, Field } from "../schema/field";
import { AdapterHost, Candidate, isMediaType, resolveCandidates } from "./candidates";
import { displayValue } from "./display";
import {
	ChildPrompt,
	ObjectFieldsEditorModal,
	ObjectListEditorModal,
} from "./input/objectEditor";
import { ChoiceSuggestModal, MultiSelectModal, PromptModal } from "./input/valueModals";
import { formatLink, linkTargetPath } from "./links";
import { asListValue, asObjectValue } from "./objectDraft";
import { baseBindingOptions } from "./options";
import { editableRootFields, TEXT_INPUT_TYPES } from "./support";
import { resolveFieldValues } from "./valuesIo";
import { validateField } from "./validate";

/** Everything an edit needs: the host, the target note, and its resolved fields. */
export interface EditContext {
	host: AdapterHost;
	file: TFile;
	/** All resolved fields of the note (including nested), for child lookup. */
	allFields: Field[];
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

function aliasFor(candidate: Candidate): string | undefined {
	return candidate.display && candidate.display !== candidate.file.basename
		? candidate.display
		: undefined;
}

function toSelectedList(current: unknown): string[] {
	if (Array.isArray(current)) return current.map(String);
	return current != null && current !== "" ? [String(current)] : [];
}

function openTextPrompt(
	app: App,
	field: Field,
	current: unknown,
	onValue: (value: unknown) => void
): void {
	new PromptModal(app, {
		title: `Set ${field.name}`,
		initial: current == null ? "" : String(current),
		placeholder: placeholderFor(field),
		validate: (v) => validateField(field, coerceInput(field, v)),
		onSubmit: (v) => onValue(coerceInput(field, v)),
	}).open();
}

/**
 * Opens the input for `field` and calls `onValue` with the chosen value. Does
 * not write. Recurses for Object/ObjectList (the draft editor edits a clone and
 * hands back the whole subtree).
 */
export async function promptFieldValue(
	ctx: EditContext,
	field: Field,
	current: unknown,
	onValue: (value: unknown) => void
): Promise<void> {
	const app = ctx.host.app;
	const file = ctx.file;
	const promptChild: ChildPrompt = (f, cur, cb) => void promptFieldValue(ctx, f, cur, cb);

	switch (field.type) {
		case "Boolean":
			new ChoiceSuggestModal<boolean>(
				app,
				[true, false],
				(b) => (b ? "true" : "false"),
				(b) => onValue(b),
				"Set true or false"
			).open();
			return;

		case "Select":
		case "Cycle": {
			const allowed = await resolveFieldValues(app, field);
			if (allowed.length === 0) return openTextPrompt(app, field, current, onValue);
			new ChoiceSuggestModal<string>(
				app,
				allowed,
				(s) => s,
				(s) => onValue(s),
				`Set ${field.name}`
			).open();
			return;
		}

		case "Multi": {
			const allowed = await resolveFieldValues(app, field);
			const selected = toSelectedList(current);
			if (allowed.length === 0) {
				new PromptModal(app, {
					title: `Set ${field.name}`,
					initial: selected.join(", "),
					placeholder: "comma, separated, values",
					onSubmit: (v) => onValue(v.split(",").map((s) => s.trim()).filter(Boolean)),
				}).open();
				return;
			}
			new MultiSelectModal(app, {
				title: `Set ${field.name}`,
				allowed,
				selected,
				onSubmit: (vals) => onValue(vals),
			}).open();
			return;
		}

		case "File":
		case "Media": {
			const embed = isMediaType(field.type) && baseBindingOptions(field).embed;
			const candidates = await resolveCandidates(ctx.host, field, file);
			new ChoiceSuggestModal<Candidate>(
				app,
				candidates,
				(c) => c.display,
				(c) => onValue(formatLink(app, c.file, file.path, aliasFor(c), embed)),
				`Set ${field.name}`
			).open();
			return;
		}

		case "MultiFile":
		case "MultiMedia": {
			const embed = isMediaType(field.type) && baseBindingOptions(field).embed;
			const candidates = await resolveCandidates(ctx.host, field, file);
			const byDisplay = new Map(candidates.map((c) => [c.display, c] as const));
			const currentPaths = new Set(
				toSelectedList(current)
					.map((v) => linkTargetPath(app, v, file.path))
					.filter((p): p is string => !!p)
			);
			const selected = candidates.filter((c) => currentPaths.has(c.file.path)).map((c) => c.display);
			new MultiSelectModal(app, {
				title: `Set ${field.name}`,
				allowed: candidates.map((c) => c.display),
				selected,
				onSubmit: (displays) =>
					onValue(
						displays
							.map((d) => byDisplay.get(d))
							.filter((c): c is Candidate => !!c)
							.map((c) => formatLink(app, c.file, file.path, aliasFor(c), embed))
					),
			}).open();
			return;
		}

		case "Object":
			new ObjectFieldsEditorModal(app, {
				title: `Edit ${field.name}`,
				childFields: childFieldsOf(ctx.allFields, field),
				promptChild,
				initial: asObjectValue(current),
				onSave: (obj) => onValue(obj),
			}).open();
			return;

		case "ObjectList":
			new ObjectListEditorModal(app, {
				title: `Edit ${field.name}`,
				childFields: childFieldsOf(ctx.allFields, field),
				promptChild,
				initial: asListValue(current),
				onSave: (arr) => onValue(arr),
			}).open();
			return;

		default:
			if (TEXT_INPUT_TYPES.has(field.type)) openTextPrompt(app, field, current, onValue);
			else new Notice(`Fileclass: "${field.type}" fields aren't editable yet.`);
	}
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

/** Opens a field's input and writes the chosen value (single write, D5). */
export async function updateField(ctx: EditContext, field: Field): Promise<void> {
	const current = readFieldValue(ctx.host.app, ctx.file, field);
	await promptFieldValue(ctx, field, current, (v) =>
		void commit(ctx.host.app, ctx.file, field, v)
	);
}

/** Removes a field's key from the note (single write). */
export function clearField(app: App, file: TFile, field: Field): Promise<void> {
	return writeFieldValue(app, file, field, undefined);
}

/** Lets the user pick one of a note's editable root fields, then edits it. */
export function pickAndUpdateField(host: AdapterHost, file: TFile, fields: Field[]): void {
	const ctx: EditContext = { host, file, allFields: fields };
	// Only root fields are edited directly; nested fields are reached via their
	// parent Object/ObjectList editor.
	const editable = editableRootFields(fields);
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
		(f) => void updateField(ctx, f),
		"Select a field to update"
	).open();
}
