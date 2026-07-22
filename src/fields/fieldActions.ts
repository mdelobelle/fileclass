/*
 * Wires field types to their input UI and the write path (ARCHITECTURE.md §7,
 * §8, D5). `promptFieldValue` is the universal, recursive dispatcher: it opens
 * the right input for a field and calls back with the chosen value **without
 * writing** (Object/ObjectList recurse into the draft editor). `updateField`
 * wraps it to perform the single frontmatter write. Values flow up to the
 * top-level (root) field, so a nested object subtree is written in one call.
 */
import { App, Notice, parseYaml, stringifyYaml, TFile } from "obsidian";

import { readFieldValue } from "../io/read";
import { writeFieldValue, writeValues } from "../io/write";
import { childFieldsOf, Field } from "../schema/field";
import { AdapterHost, Candidate, isMediaType, resolveCandidates } from "./candidates";
import { makeDisplayDeps } from "./displayDeps";
import { describeField } from "./objectDisplay";
import {
	ChildPrompt,
	ObjectFieldsEditorModal,
	ObjectListEditorModal,
} from "./input/objectEditor";
import { DateInputModal } from "./input/dateInputModal";
import { DurationInputModal, CycleDurationEditorModal } from "./input/durationModal";
import { LocationInputModal } from "./input/locationModal";
import { addDuration, formatDuration } from "./duration";
import {
	BooleanInputModal,
	ChoiceSuggestModal,
	MultiInputEditorModal,
	MultiSelectModal,
	PromptModal,
	TemplateInputModal,
	TextAreaInputModal,
} from "./input/valueModals";
import {
	parseStructured,
	serializeStructured,
	StructuredType,
	YamlCodec,
} from "./structuredText";
import { formatLink, linkTargetPath } from "./links";
import { asListValue, asObjectValue } from "./objectDraft";
import {
	baseBindingOptions,
	dateOptions,
	durationPresets,
	inputTemplate,
	numberOptions,
} from "./options";
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

/**
 * Builds the "Set next date" action for a Date/DateTime field, or undefined when
 * its `nextIntervalField` option doesn't point at a Duration/CycleDuration field
 * holding a value. The action advances the date by the (head) interval and, for
 * a CycleDuration, rotates the list head→tail — both in a single write.
 */
function nextDateProvider(
	ctx: EditContext,
	dateField: Field
): { label: string; apply: (currentIso: string) => Promise<boolean> } | undefined {
	const name = dateOptions(dateField).nextIntervalField;
	if (!name) return undefined;
	const interval = ctx.allFields.find(
		(f) => f.name === name && (f.type === "Duration" || f.type === "CycleDuration")
	);
	if (!interval) return undefined;

	const app = ctx.host.app;
	const listOf = (): string[] => {
		const stored = readFieldValue(app, ctx.file, interval);
		return interval.type === "CycleDuration" ? toSelectedList(stored) : [String(stored ?? "")];
	};
	// The interval to be applied (head of the list) — shown to the user; no button
	// when there is none to apply.
	const head = listOf()[0];
	if (!head || !head.trim()) return undefined;
	const label = formatDuration(head) || head;

	const apply = async (currentIso: string): Promise<boolean> => {
		const list = listOf();
		const current = list[0];
		if (!current) {
			new Notice(`Fileclass: "${interval.name}" has no interval to apply.`);
			return false;
		}
		const nextDate = addDuration(currentIso, current);
		if (!nextDate) {
			new Notice(`Fileclass: could not compute the next date from "${current}".`);
			return false;
		}
		const writes: { namePath: string[]; value: unknown }[] = [
			{ namePath: [dateField.name], value: nextDate },
		];
		if (interval.type === "CycleDuration" && list.length > 1) {
			writes.push({ namePath: [interval.name], value: [...list.slice(1), current] });
		}
		try {
			await writeValues(app, ctx.file, writes);
			new Notice(`Fileclass: ${dateField.name} → ${nextDate}`);
			return true;
		} catch (err) {
			new Notice(`Fileclass: could not set the next date (${(err as Error).message}).`);
			return false;
		}
	};

	return { label, apply };
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

/** A number input with spinner and the field's min/max/step constraints. */
function openNumberPrompt(
	app: App,
	field: Field,
	current: unknown,
	onValue: (value: unknown) => void
): void {
	const { min, max, step } = numberOptions(field);
	new PromptModal(app, {
		title: `Set ${field.name}`,
		initial: current == null ? "" : String(current),
		placeholder: placeholderFor(field),
		configureInput: (el) => {
			el.type = "number";
			if (min != null) el.min = String(min);
			if (max != null) el.max = String(max);
			if (step != null) el.step = String(step);
		},
		validate: (v) => validateField(field, coerceInput(field, v)),
		onSubmit: (v) => onValue(coerceInput(field, v)),
	}).open();
}

const YAML_CODEC: YamlCodec = { parse: parseYaml, stringify: stringifyYaml };

/** A monospace textarea editing a free-form JSON/YAML value, parser-validated. */
function openStructuredPrompt(
	app: App,
	field: Field,
	current: unknown,
	onValue: (value: unknown) => void
): void {
	const type = field.type as StructuredType;
	new TextAreaInputModal(app, {
		title: `Set ${field.name}`,
		initial: serializeStructured(type, current, YAML_CODEC),
		placeholder: type === "JSON" ? '{\n  "key": "value"\n}' : "key: value",
		validate: (v) => {
			const r = parseStructured(type, v, YAML_CODEC);
			return r.ok ? { ok: true } : { ok: false, message: r.message };
		},
		onSubmit: (v) => {
			const r = parseStructured(type, v, YAML_CODEC);
			if (r.ok) onValue(r.value);
		},
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
			new BooleanInputModal(app, {
				title: `Set ${field.name}`,
				initial: current === true || current === "true",
				onSubmit: (v) => onValue(v),
			}).open();
			return;

		case "Select":
		case "Cycle": {
			const allowed = await resolveFieldValues(ctx.host, field, file);
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
			const allowed = await resolveFieldValues(ctx.host, field, file);
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
				field,
				childFields: childFieldsOf(ctx.allFields, field),
				promptChild,
				deps: makeDisplayDeps(ctx.host, ctx.allFields),
				initial: asObjectValue(current),
				onSave: (obj) => onValue(obj),
			}).open();
			return;

		case "ObjectList":
			new ObjectListEditorModal(app, {
				title: `Edit ${field.name}`,
				field,
				childFields: childFieldsOf(ctx.allFields, field),
				promptChild,
				deps: makeDisplayDeps(ctx.host, ctx.allFields),
				initial: asListValue(current),
				onSave: (arr) => onValue(arr),
			}).open();
			return;

		case "Date":
		case "DateTime":
		case "Time":
			new DateInputModal(app, {
				field,
				initial: current == null ? "" : String(current),
				onSubmit: (v) => onValue(v),
				nextInterval: field.type === "Time" ? undefined : nextDateProvider(ctx, field),
			}).open();
			return;

		case "Duration":
			new DurationInputModal(app, {
				title: `Set ${field.name}`,
				initial: current == null ? "" : String(current),
				presets: durationPresets(field),
				onSubmit: (v) => onValue(v),
			}).open();
			return;

		case "CycleDuration":
			new CycleDurationEditorModal(app, {
				title: `Edit ${field.name}`,
				initial: toSelectedList(current),
				presets: durationPresets(field),
				onSubmit: (vals) => onValue(vals),
			}).open();
			return;

		case "Location":
			new LocationInputModal(app, {
				title: `Set ${field.name}`,
				initial: current == null ? "" : String(current),
				onSubmit: (v) => onValue(v),
			}).open();
			return;

		case "Number":
			openNumberPrompt(app, field, current, onValue);
			return;

		case "JSON":
		case "YAML":
			openStructuredPrompt(app, field, current, onValue);
			return;

		case "MultiInput":
			new MultiInputEditorModal(app, {
				title: `Edit ${field.name}`,
				template: inputTemplate(field),
				initial: toSelectedList(current),
				onSubmit: (vals) => onValue(vals),
			}).open();
			return;

		case "Input": {
			const template = inputTemplate(field);
			if (template) {
				new TemplateInputModal(app, {
					title: `Set ${field.name}`,
					template,
					initial: current == null ? "" : String(current),
					onSubmit: (v) => onValue(v),
				}).open();
				return;
			}
			openTextPrompt(app, field, current, onValue);
			return;
		}

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

/** Flips a Boolean field and writes it directly (no modal, single write). */
export async function toggleBooleanField(ctx: EditContext, field: Field): Promise<void> {
	const current = readFieldValue(ctx.host.app, ctx.file, field);
	const next = !(current === true || current === "true");
	await commit(ctx.host.app, ctx.file, field, next);
}

/** Cycles a Cycle field to its next allowed value and writes it (single write). */
export async function cycleField(ctx: EditContext, field: Field): Promise<void> {
	const allowed = await resolveFieldValues(ctx.host, field, ctx.file);
	if (!allowed.length) return updateField(ctx, field); // no list → fall back to input
	const current = readFieldValue(ctx.host.app, ctx.file, field);
	const idx = allowed.indexOf(current == null ? "" : String(current));
	const next = allowed[(idx + 1) % allowed.length];
	await commit(ctx.host.app, ctx.file, field, next);
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
	const deps = makeDisplayDeps(host, fields);
	new ChoiceSuggestModal<Field>(
		host.app,
		editable,
		(f) => {
			const value = describeField(f, readFieldValue(host.app, file, f), deps);
			return value ? `${f.name}: ${value}` : f.name;
		},
		(f) => void updateField(ctx, f),
		"Select a field to update"
	).open();
}
