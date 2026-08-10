/*
 * Fileclass's additions to Obsidian's native Properties editor (ARCHITECTURE.md
 * §19.6). Two injections, one host — the section is watched by a single
 * MutationObserver per leaf, so both live here rather than in two components
 * fighting over the same DOM:
 *
 *   1. per-row edit buttons (the original feature, `enablePropertyEditButtons`);
 *   2. section actions next to "Add property" (`enablePropertyActionButtons`):
 *      "Add a class", and "Insert N missing fields" when any are missing.
 *
 * On (1): for each property row whose key is an editable field of the note's
 * fileClass, a small button between the key and the value performs the type's
 * gesture (runControlAction): a Cycle advances, a Boolean flips, everything else
 * opens Fileclass's typed input — so users get validation/guided input from the
 * properties panel, like Metadata Menu. Alt-click performs the gesture the click
 * doesn't: the input for a Cycle or Boolean, and for a date wired to an interval
 * sequence, the next date (the button then shows it while Alt is held).
 *
 * Another fragile DOM-injection boundary (like the indicators, §19.4): isolated
 * here, behind a setting, dedup-guarded, best-effort, removed on unload. Core
 * features never depend on it.
 */
import { Component, Notice, TFile, debounce, editorInfoField, setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";

import type FileclassPlugin from "../../main";
import { insertMissingFields } from "../commands/insertMissingFields";
import { missingRootFields } from "../fields/missingFields";
import { reorderFrontmatter } from "../io/reorderFrontmatter";
import { reorderPlan } from "../schema/reorder";
import { controlActionFor, controlLabel } from "../fields/controlAction";
import { EditContext, nextDateActionFor, runControlAction } from "../fields/fieldActions";
import { isInputSupported } from "../fields/support";
import { fieldTypeIcon } from "../fields/typeIcons";
import { openFieldSettings } from "./fieldSettings";
import { Field, FieldType, isRootField } from "../schema/field";
import { hasFieldKey, readFieldValue } from "../io/read";
import { AddFileClassModal } from "./addFileClassModal";
import { attachAltAffordance } from "./altAffordance";
import { openAddFieldTo, openFileClassSchema } from "./fileClassSchemaModal";
import { FileClassOptionsModal } from "./fileClassOptionsModal";
import { openBulkEdit } from "./bulkEditModal";
import { pickAndCreateBase } from "../views/baseFileGenerator";
import {
	baseSyncStatus,
	fileClassBaseFile,
	openFileClassBase,
	syncFileClassToBase,
} from "../views/baseSync";
import { describeField, displayTemplateOf } from "../fields/objectDisplay";
import { isEmpty, isRequired, validateField } from "../fields/validate";
import { makeDisplayDeps } from "../fields/displayDeps";
import { makeValuePreview } from "./valuePreview";
import { humanDurationsFor } from "../fields/duration";

const BTN_CLASS = "fileclass-prop-edit";
const PREVIEW_CLASS = "fileclass-prop-preview";
/** The section-actions wrapper, sitting right after "Add property". */
const ACTIONS_CLASS = "fileclass-prop-actions";
/** The "open this class's schema" button, on the fileClass row (#23). */
const CLASS_CLASS = "fileclass-prop-class";
/** Marks a nested value Obsidian can't interpret but this plugin declares and validates. */
const GROUP_OK_CLASS = "fileclass-group-ok";
const FIELDS_ROW_CLASS = "fileclass-fields-summary";
const FIELDS_ROW_MARK = "fileclass-fields-row";
/** The reading of a stored duration, inside its pill. */
const PILL_HUMAN_CLASS = "fileclass-pill-human";
/** Set on a field's button when the field is required and has no value. */
const REQUIRED_CLASS = "is-required-empty";
/** Types whose value is a nested structure Obsidian cannot interpret, but we can. */
const STRUCTURED_TYPES = new Set<FieldType>(["Object", "ObjectList", "JSON", "YAML"]);
/** Leaf types whose views render a native Properties editor. */
const LEAF_TYPES = ["markdown", "file-properties"];

export class PropertyEditButtons extends Component {
	private watched: MutationObserver[] = [];
	private scheduleInject: () => void = () => undefined;

	constructor(private readonly plugin: FileclassPlugin) {
		super();
	}

	onload(): void {
		this.scheduleInject = debounce(() => this.injectAll(), 100, true);
		const ws = this.plugin.app.workspace;
		this.registerEvent(ws.on("layout-change", () => this.reattachAndInject()));
		this.registerEvent(ws.on("active-leaf-change", this.scheduleInject));
		this.registerEvent(ws.on("file-open", this.scheduleInject));
		// Editing a value re-renders the row (dropping our button) — re-inject.
		this.registerEvent(this.plugin.app.metadataCache.on("changed", this.scheduleInject));
		this.registerEvent(this.plugin.index.on("fileclass:indexed", () => this.fullRefresh()));
		ws.onLayoutReady(() => this.reattachAndInject());
	}

	onunload(): void {
		this.detach();
		this.removeAll();
	}

	/** Re-injects immediately (e.g. after a settings toggle). */
	refreshNow(): void {
		this.fullRefresh();
	}

	private reattachAndInject(): void {
		this.reattach();
		this.injectAll();
	}

	private reattach(): void {
		this.detach();
		for (const type of LEAF_TYPES) {
			for (const leaf of this.plugin.app.workspace.getLeavesOfType(type)) {
				const observer = new MutationObserver(() => this.scheduleInject());
				observer.observe(leaf.view.containerEl, { subtree: true, childList: true });
				this.watched.push(observer);
			}
		}
		// A Properties editor can also live outside every leaf: the Bases toolbar's *New*
		// opens `.bases-new-item-popover`, an embedded editor on the note it just created,
		// and it appeared with none of these controls. Popovers are appended to the body, so
		// one shallow observer there is enough to notice one arriving — `childList` without
		// `subtree`, since the body's own children change about once a session.
		const popovers = new MutationObserver(() => this.scheduleInject());
		popovers.observe(document.body, { childList: true });
		this.watched.push(popovers);
	}

	private detach(): void {
		this.watched.forEach((o) => o.disconnect());
		this.watched = [];
	}

	private fullRefresh(): void {
		this.removeAll();
		this.injectAll();
	}

	private injectAll(): void {
		try {
			if (this.plugin.settings.enablePropertyEditButtons) {
				document
					.querySelectorAll<HTMLElement>(".metadata-property[data-property-key]")
					.forEach((row) => {
						this.injectRow(row);
						this.injectClassRow(row);
						this.injectFieldsRow(row);
					});
			}
			if (this.plugin.settings.enablePropertyActionButtons) {
				// Our own buttons don't carry the native class, so this can't match them.
				document
					.querySelectorAll<HTMLElement>(".metadata-content > .metadata-add-button")
					.forEach((add) => this.injectActions(add));
			}
		} catch {
			/* a drifted selector must never break the app */
		}
	}

	/**
	 * The actions beside the native "Add property" button (which is inline-flex, so they land
	 * on its line): what this note can be asked for.
	 *
	 * A **class note** gets the ones that act on the class — add a field, its options, its
	 * base, a bulk edit — and not *Add a class*, which would bind a class to a class.
	 * Every other note gets the note actions.
	 *
	 * The whole set is rebuilt only when its state changes: this DOM is watched,
	 * and mutating it on every pass would feed the observer forever.
	 */
	private injectActions(add: HTMLElement): void {
		const file = this.fileForEl(add);
		const existing = add.parentElement?.querySelector<HTMLElement>(`:scope > .${ACTIONS_CLASS}`);
		if (!file) {
			existing?.remove(); // not a note's properties editor (e.g. a canvas card)
			return;
		}

		const fcName = this.plugin.index.fileClassNameOfNote(file.path);
		if (fcName) return this.injectClassActions(add, existing, file, fcName);

		const fields = this.plugin.index.getFields(file);
		const bound = this.plugin.index.getFileClasses(file).length;
		const missing = bound
			? missingRootFields(fields, (f) => hasFieldKey(this.plugin.app, file, f))
			: [];
		// Cheap enough to ask on every render: one pass over the note's keys, no I/O — the
		// frontmatter is already parsed in the cache. `null` means "already in order", which
		// is also what decides whether the button exists at all (#104).
		const outOfOrder =
			bound &&
			reorderPlan(
				fields,
				Object.keys(this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {}),
				this.plugin.settings.unknownKeysPosition
			) !== null;
		const state = `${file.path}:${bound}:${missing.length}:${outOfOrder ? "unordered" : "ordered"}`;
		if (existing?.dataset.fcState === state) return;
		existing?.remove();

		const wrapper = createSpan({ cls: ACTIONS_CLASS });
		wrapper.dataset.fcState = state;
		wrapper.append(
			this.makeActionButton(
				"plus",
				"Add a class",
				`Bind ${bound ? "another fileClass" : "a fileClass"} to this note`,
				() => new AddFileClassModal(this.plugin, file).open()
			)
		);
		// Absent when nothing is missing: its presence is the signal, and it is
		// never a button whose only outcome is "nothing to insert".
		if (missing.length) {
			const label = `Insert ${missing.length} missing field${missing.length > 1 ? "s" : ""}`;
			wrapper.append(
				this.makeActionButton(
					"list-plus",
					label,
					`Add ${missing.map((f) => f.name).join(", ")} with empty values`,
					() => void insertMissingFields(this.plugin.app, file, fields)
				)
			);
		}
		// Same rule as the button above: it appears when there is something to do, and its
		// presence is the whole message. A note already in its class's order shows nothing.
		if (outOfOrder) {
			wrapper.append(
				this.makeActionButton(
					"arrow-down-up",
					"Reorder properties",
					"Put this note's properties back in the order its class declares them",
					() => void this.reorder(file, fields)
				)
			);
		}
		add.after(wrapper);
	}

	/** The class actions, in the order you use them: shape it, set it up, look at it, edit it. */
	private injectClassActions(
		add: HTMLElement,
		existing: HTMLElement | null | undefined,
		file: TFile,
		fcName: string
	): void {
		const base = fileClassBaseFile(this.plugin, fcName);
		// The class's own shape is part of the state: editing the schema leaves the base file
		// and its path untouched, and it is exactly what makes a synced base diverge. Without
		// it the row would keep saying "Modify" over a table that no longer matches.
		const shape = this.plugin.index
			.getResolvedFields(fcName)
			.filter((f) => isRootField(f))
			.map((f) => f.name)
			.join(",");
		const state = `class:${fcName}:${base?.path ?? ""}:${shape}`;
		if (existing?.dataset.fcState === state) return;
		existing?.remove();

		const wrapper = createSpan({ cls: ACTIONS_CLASS });
		wrapper.dataset.fcState = state;
		wrapper.append(
			this.makeActionButton("plus", "Add a field", `Declare a new field on ${fcName}`, () =>
				openAddFieldTo(this.plugin, fcName)
			),
			this.makeActionButton(
				"settings-2",
				"Options",
				`What ${fcName} extends, excludes, and the notes it claims`,
				() => new FileClassOptionsModal(this.plugin, fcName, file).open()
			),
			this.baseButton(wrapper, state, fcName, base)
		);
		// Same rule as the note actions: a button appears when it has somewhere to go.
		if (base) {
			wrapper.append(
				this.makeActionButton("table", "Open the base", `Open ${base.path}`, () =>
					openFileClassBase(this.plugin, fcName)
				)
			);
		}
		wrapper.append(
			this.makeActionButton(
				"replace",
				"Bulk edit a field",
				`Set one of ${fcName}'s fields across the notes that carry it`,
				() => openBulkEdit(this.plugin, fcName)
			)
		);
		add.after(wrapper);
	}

	/**
	 * The base button, and the one thing on this row that answers late.
	 *
	 * A class whose table no longer mirrors it now says so, on the button that fixes it:
	 * `baseSyncStatus` was written and never called, so a base generated before the class
	 * gained a field, renamed one or reordered them was stale in a way nothing showed — the
	 * only way to find out was to open the table and count columns.
	 *
	 * Reading and parsing the base is I/O, so the button is built with what is already known
	 * ("Modify the base", which is true) and relabelled when the answer lands, rather than
	 * holding the whole row back on a file read.
	 */
	private baseButton(
		wrapper: HTMLElement,
		state: string,
		fcName: string,
		base: TFile | null
	): HTMLElement {
		let diverged = false;
		const button = this.makeActionButton(
			"layout-grid",
			base ? "Modify the base" : "Create a base",
			base
				? `Sync ${fcName}'s fields into ${base.path}`
				: `Generate a base whose table is ${fcName}'s fields`,
			() => {
				// Labelled "Sync the base", it syncs — one click, and the notice says what it did.
				if (!diverged) return pickAndCreateBase(this.plugin, fcName);
				void syncFileClassToBase(this.plugin, fcName).then((ok) => {
					if (!ok || !button.isConnected) return;
					diverged = false;
					restore();
				});
			}
		);
		const label = button.querySelector(".text-button-label");
		const restore = (): void => {
			label?.setText("Modify the base");
			button.removeClass("is-fc-diverged");
			button.setAttribute("aria-label", `Fileclass: Sync ${fcName}'s fields into ${base?.path ?? ""}`);
		};
		if (!base) return button;

		void baseSyncStatus(this.plugin, fcName).then((status) => {
			// The row may have been rebuilt, or the note left, while the file was read.
			if (status !== "diverged" || !wrapper.isConnected || wrapper.dataset.fcState !== state) return;
			diverged = true;
			label?.setText("Sync the base");
			button.addClass("is-fc-diverged");
			button.setAttribute(
				"aria-label",
				`Fileclass: ${fcName} has changed since its table was written — bring its columns back in line`
			);
		});
		return button;
	}

	private async reorder(file: TFile, fields: Field[]): Promise<void> {
		const { moved, unpositionable } = await reorderFrontmatter(
			this.plugin.app,
			file,
			fields,
			this.plugin.settings.unknownKeysPosition
		);
		if (!moved) return;
		const caveat = unpositionable.length
			? ` (${unpositionable.join(", ")} stays where YAML puts it)`
			: "";
		new Notice(`Fileclass: reordered ${moved} properties${caveat}.`);
	}

	private makeActionButton(
		icon: string,
		label: string,
		hint: string,
		onClick: () => void
	): HTMLElement {
		// `text-icon-button` is the native look; the plugin's own class carries the
		// spacing (styles.css) so no Obsidian selector can pick this up as its own.
		const btn = createDiv({ cls: "text-icon-button fileclass-prop-action" });
		btn.tabIndex = 0;
		btn.setAttribute("aria-label", `Fileclass: ${hint}`);
		setIcon(btn.createSpan({ cls: "text-button-icon" }), icon);
		btn.createSpan({ cls: "text-button-label", text: label });
		const run = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			onClick();
		};
		btn.addEventListener("click", run);
		btn.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") run(e);
		});
		return btn;
	}

	/**
	 * On the `fileClass` row: one button per bound class, opening its schema (#23).
	 *
	 * The value is an identifier, not a link — binding can also come from a tag, a
	 * path or a Base view — so there is nothing to click through to. This adds the
	 * missing affordance without changing what is stored.
	 *
	 * Two shapes to cover, and which one appears is Obsidian's decision, not ours:
	 * a property it types as List renders each value as a `.multi-select-pill`
	 * (even a single one), while a Text property renders the raw value. Both are
	 * handled; a name that matches no class gets no button, which is also how a
	 * typo announces itself.
	 */
	/**
	 * The `fields` row of a class note: the schema, not its JSON.
	 *
	 * A class's fields are a list of objects, which Obsidian has no editor for — so the panel
	 * printed the raw JSON, in the warning colour it reserves for values nobody can make sense
	 * of. On the one note where that value is the whole point, that read as an error and told
	 * you nothing: you counted braces to find out how many fields the class had.
	 *
	 * It now reads "N fields" behind a wrench that opens the schema — the row says what it
	 * holds, and offers the only thing you would do with it.
	 */
	private injectFieldsRow(row: HTMLElement): void {
		// Obsidian lowercases data-property-key, hence the case-insensitive match.
		if (row.getAttribute("data-property-key")?.toLowerCase() !== "fields") return;
		const file = this.fileForEl(row);
		const fcName = file && this.plugin.index.fileClassNameOfNote(file.path);
		if (!file || !fcName) return;
		const item = row.querySelector<HTMLElement>(
			":scope > .metadata-property-value > .metadata-property-value-item.mod-unknown"
		);
		if (!item) return;

		const declared: unknown = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.fields;
		const list = Array.isArray(declared) ? declared : [];
		const root = list.filter((f) => !(f as { path?: string })?.path).length;
		const nested = list.length - root;
		const state = `${fcName}:${root}:${nested}`;
		if (item.dataset.fcFields === state) return; // settled: no new mutation
		item.dataset.fcFields = state;

		// The JSON is kept, so switching the buttons off puts the row back as Obsidian wrote it.
		item.dataset.fcRaw ??= item.textContent ?? "";
		item.empty();
		item.addClass(FIELDS_ROW_MARK);
		// Everything of ours lives in one span: removing it takes its listeners with it.
		const summary = item.createSpan({ cls: FIELDS_ROW_CLASS });
		setIcon(summary.createSpan({ cls: "fileclass-fields-wrench" }), "wrench");
		summary.createSpan({ text: `${root} field${root === 1 ? "" : "s"}` });
		summary.setAttribute(
			"aria-label",
			`Fileclass: open ${fcName}'s schema` +
				(nested ? ` — ${root} at the top level, ${nested} inside them` : "")
		);
		summary.tabIndex = 0;
		const open = (e: Event): void => {
			e.preventDefault();
			e.stopPropagation();
			openFileClassSchema(this.plugin, fcName);
		};
		summary.addEventListener("click", open);
		summary.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") open(e);
		});
	}

	private injectClassRow(row: HTMLElement): void {
		const key = row.getAttribute("data-property-key");
		const alias = this.plugin.settings.fileClassAlias;
		// Obsidian lowercases data-property-key, hence the case-insensitive match.
		if (!key || !alias || key.toLowerCase() !== alias.toLowerCase()) return;
		const valueEl = row.querySelector<HTMLElement>(":scope > .metadata-property-value");
		if (!valueEl) return;

		const pills = valueEl.querySelectorAll<HTMLElement>(
			":scope > .multi-select-container > .multi-select-pill"
		);
		if (pills.length) {
			pills.forEach((pill) => {
				const name = pill.querySelector(".multi-select-pill-content")?.textContent?.trim() ?? "";
				const remove = pill.querySelector<HTMLElement>(
					":scope > .multi-select-pill-remove-button"
				);
				this.placeClassButton(pill, name, remove);
			});
			// A pill removed since the last pass leaves nothing behind: its button
			// lived inside it.
			return;
		}
		// A text value fills the row, so appending to it would park the button at the
		// far right edge. It goes in the icon column instead — between the key and
		// the value, where every other row's control sits.
		this.placeClassButton(row, valueEl.textContent?.trim() ?? "", valueEl);
	}

	/**
	 * Puts (or refreshes, or removes) the schema button for `name` inside `host`,
	 * before `before` when given. Dedup by name so a settled row mutates no
	 * further — this DOM is watched, and a re-inject on every pass would loop.
	 */
	private placeClassButton(host: HTMLElement, name: string, before: HTMLElement | null): void {
		const existing = host.querySelector<HTMLElement>(`:scope > .${CLASS_CLASS}`);
		const known = !!name && !!this.plugin.index.getFileClass(name);
		if (!known) {
			existing?.remove();
			return;
		}
		if (existing?.dataset.fcName === name) return;
		existing?.remove();
		const btn = createSpan({ cls: `${CLASS_CLASS} clickable-icon` });
		btn.dataset.fcName = name;
		btn.setAttribute("aria-label", `Fileclass: Open "${name}" schema`);
		setIcon(btn, "wrench");
		btn.addEventListener("click", (e) => {
			// Inside a pill, a click would otherwise start editing the value.
			e.preventDefault();
			e.stopPropagation();
			openFileClassSchema(this.plugin, name);
		});
		if (before) host.insertBefore(btn, before);
		else host.appendChild(btn);
	}

	/**
	 * For an `Object`/`ObjectList` field that defines a display template, shows that
	 * template's text where Obsidian shows the raw JSON.
	 *
	 * Safe because Obsidian types a nested mapping as `unknown` and prints it in a
	 * read-only span — nothing is being edited there, so nothing is taken away, and
	 * the JSON stays one hover away. The `mod-unknown` guard means this only ever
	 * touches the shape Obsidian renders today: make nested properties editable in a
	 * future version and this quietly stops.
	 */
	/**
	 * The reading of each stored duration, inside its own pill, just left of the remove
	 * button. Obsidian renders a list value as pills whose text stays editable, so the
	 * reading is added next to each one rather than over it — and inside the pill rather
	 * than beside the row, because there it says *which* value it reads.
	 *
	 * Returns true when the value is a list of durations, so the caller drops the
	 * row-level preview that would repeat it.
	 *
	 * Idempotent by necessity: this row is watched by a MutationObserver, and a mutation
	 * on every pass would feed it forever. A pill already carrying its reading is left
	 * exactly as it is.
	 */
	private decorateDurationPills(valueEl: HTMLElement, field: Field): boolean {
		if (field.type !== "Duration" && field.type !== "CycleDuration") return false;
		const pills = Array.from(valueEl.querySelectorAll<HTMLElement>(".multi-select-pill"));
		if (!pills.length) return false;
		for (const pill of pills) {
			const content = pill.querySelector<HTMLElement>(":scope > .multi-select-pill-content");
			const remove = pill.querySelector<HTMLElement>(":scope > .multi-select-pill-remove-button");
			const stored = (content?.textContent ?? "").trim();
			const text = humanDurationsFor(stored, "");
			const existing = pill.querySelector<HTMLElement>(`:scope > .${PILL_HUMAN_CLASS}`);
			if (existing?.dataset.fcFor === stored) continue; // settled
			existing?.remove();
			if (!text || !remove) continue; // nothing to read, or nowhere to put it
			const el = createSpan({ cls: PILL_HUMAN_CLASS, text });
			el.dataset.fcFor = stored;
			pill.insertBefore(el, remove);
		}
		return true;
	}

	private decorateGroupValue(valueEl: HTMLElement, field: Field, file: TFile): void {
		// `JSON`/`YAML` join the groups here: Obsidian can't interpret a nested value,
		// but a class that declares one as free-form structure understands it — it round
		// -trips it through an editor. They have no display template, so what stays on
		// screen is the raw value, which for these two types is the honest answer.
		if (!STRUCTURED_TYPES.has(field.type)) return;
		const item = valueEl.querySelector<HTMLElement>(
			":scope > .metadata-property-value-item.mod-unknown"
		);
		if (!item) return;
		const raw = readFieldValue(this.plugin.app, file, field);

		// Obsidian paints an uninterpreted value in --text-warning, which is right for
		// a value nobody can make sense of and wrong for a group this class declares
		// and validates. Drop the warning colour only when both hold; an invalid group
		// keeps it, because there the warning is the truth.
		item.classList.toggle(GROUP_OK_CLASS, validateField(field, raw).ok);

		if (!displayTemplateOf(field)) return;
		const text = describeField(field, raw, makeDisplayDeps(this.plugin.index.getFields(file)));
		if (!text || item.dataset.fcTemplate === text) return; // settled: no new mutation
		item.dataset.fcRaw ??= item.textContent ?? "";
		item.title = item.dataset.fcRaw;
		item.dataset.fcTemplate = text;
		item.setText(text);
	}

	private injectRow(row: HTMLElement): void {
		const key = row.getAttribute("data-property-key");
		const valueEl = row.querySelector<HTMLElement>(":scope > .metadata-property-value");
		if (!key || !valueEl) return;

		const file = this.fileForEl(row);
		const field = file && this.editableField(file, key);
		const existing = row.querySelector<HTMLElement>(`:scope > .${BTN_CLASS}`);
		const existingPreview = row.querySelector<HTMLElement>(`:scope > .${PREVIEW_CLASS}`);

		if (!field) {
			existing?.remove(); // key no longer maps to an editable field
			existingPreview?.remove();
			return;
		}
		let button = existing;
		// The row is Obsidian's, and it recycles it: switching notes keeps the element
		// and rewrites its contents. A button reused on the strength of its key alone
		// therefore survived onto another note still carrying the first one — so the
		// control of `editions` on one book opened the editions of another, and a Cycle
		// would have advanced the wrong note's value in silence. The file is part of a
		// button's identity, and its type is too: the same key on another class can be
		// another field, with another icon and another gesture.
		if (
			!button ||
			button.dataset.fcKey !== key ||
			button.dataset.fcFile !== file.path ||
			button.dataset.fcType !== field.type
		) {
			button?.remove();
			button = this.makeButton(file, field, key, row);
			row.insertBefore(button, valueEl);
		}
		// A list of durations reads inside its own pills (below), so the row-level
		// preview would say the same thing twice, further from the value it reads.
		const perPill = this.decorateDurationPills(valueEl, field);
		if (perPill) existingPreview?.remove();

		// Type preview (Color swatch / Icon glyph) right after the button (between
		// it and the value). Dedup by key+value so a settled row triggers no
		// further DOM mutation (the row is watched — re-injecting every run loops).
		const value = (valueEl.textContent ?? "").trim();
		if (
			!perPill &&
			(!existingPreview ||
				existingPreview.dataset.fcKey !== key ||
				existingPreview.dataset.fcValue !== value)
		) {
			existingPreview?.remove();
			const preview = makeValuePreview(field, value, {
				app: this.plugin.app,
				sourcePath: file.path,
				// A list value can't be recovered from the row's text; read it instead.
				raw: readFieldValue(this.plugin.app, file, field),
			});
			if (preview) {
				preview.addClass(PREVIEW_CLASS);
				preview.dataset.fcKey = key;
				preview.dataset.fcValue = value;
				button.after(preview);
			}
		}
		this.decorateGroupValue(valueEl, field, file);
		this.decorateRequired(row, field, file);
	}

	/**
	 * A required field with nothing in it colours **its own button** red, rather than
	 * adding a word beside the value: the control you would use to fix it is the one that
	 * carries the signal, and a chip in a red box looked like an error banner dropped into
	 * the row (looked at, then thrown away).
	 *
	 * Only when the key exists: Obsidian lists the keys a note has, so a required field
	 * never written has no row here — that case is what "Insert N missing fields" is for.
	 *
	 * Idempotent, because this row is watched: the class and the label are set to what
	 * they should be, which is a no-op once they already are.
	 */
	private decorateRequired(row: HTMLElement, field: Field, file: TFile): void {
		const button = row.querySelector<HTMLElement>(`:scope > .${BTN_CLASS}`);
		if (!button) return;
		const unmet = isRequired(field) && isEmpty(readFieldValue(this.plugin.app, file, field));
		if (button.hasClass(REQUIRED_CLASS) === unmet) return; // settled
		button.toggleClass(REQUIRED_CLASS, unmet);
		const label = button.getAttribute("aria-label") ?? "";
		const suffix = " — required";
		button.setAttribute(
			"aria-label",
			unmet ? (label.includes(suffix) ? label : label + suffix) : label.replace(suffix, "")
		);
	}

	private makeButton(file: TFile, field: Field, key: string, row: HTMLElement): HTMLElement {
		const btn = createSpan({ cls: `${BTN_CLASS} clickable-icon` });
		btn.dataset.fcKey = key;
		btn.dataset.fcFile = file.path;
		btn.dataset.fcType = field.type;
		// The label names the gesture this type performs, not a generic "edit": a Cycle
		// advances and a Boolean flips, here as in every other surface. It is prefixed with
		// the plugin's name the way its commands are ("Fileclass: …") — a trailing
		// "(Fileclass)" was read as a placeholder left unsubstituted, since in this plugin's
		// vocabulary that parenthesis is where a fileClass name would belong.
		// The note is read from the row at call time rather than captured: the row
		// outlives the note shown in it, and no click may land on a stale file.
		const fileNow = (): TFile => this.fileForEl(row) ?? file;
		const ctxOf = (): EditContext => {
			const current = fileNow();
			return {
				host: this.plugin,
				file: current,
				allFields: this.plugin.index.getFields(current),
			};
		};
		const { verb, alt } = controlLabel(controlActionFor(field.type));
		const icon = fieldTypeIcon(field.type);
		let hint = alt ? " (Alt-click to pick a value)" : "";
		// A date wired to an interval sequence advances on Alt-click, so its button
		// says so — and shows the date it would write while Alt is held.
		const hasNextDate = !!nextDateActionFor(ctxOf(), field);
		if (hasNextDate) hint = " (Alt-click to set the next date)";
		/*
		 * **Alt belongs to the value here, and right-click to the field.** One rule per
		 * surface, no exception: in this panel Alt-click opens a type's picker — a Cycle's
		 * list rather than its next value — which take 006 taught on this very button, in a
		 * published video. A wrench appearing under Alt on the rows where nothing else claims
		 * it was tried and dropped: a gesture that means two things depending on the type is
		 * worse than one that means one thing and is written on the tooltip.
		 *
		 * The note-fields modal keeps its own rule, also published (take 026): there the type
		 * icon and the action button are two elements, so Alt over the *icon* is free to open
		 * the field's definition.
		 */
		const label = `Fileclass: ${verb} "${field.name}" — ${field.type}${hint} · right-click for its settings`;
		btn.setAttribute("aria-label", label);
		setIcon(btn, icon);
		if (hasNextDate) {
			attachAltAffordance(btn, { icon, label }, () => {
				const next = nextDateActionFor(ctxOf(), field);
				return next
					? {
							icon: "skip-forward",
							label: `Fileclass: Set "${field.name}" to ${next.next} (+${next.interval})`,
						}
					: null;
			});
		}
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const ctx = ctxOf();
			// The field is resolved from the note being shown now, for the same reason
			// the file is: on another note this key may be another field, or none.
			const current = this.editableField(ctx.file, key);
			if (!current) return;
			void runControlAction(ctx, current, { alt: e.altKey });
		});
		/*
		 * Right-click edits the **field**, not its value — the definition modal, from the
		 * panel where you noticed the problem. The note-fields modal has had this since take
		 * 006, on Alt-click over the type icon; here the icon *is* the button, and Alt is
		 * already spoken for by the types that pick from a list. Right-click was free, and it
		 * is where a "settings for this thing" gesture is looked for anyway. The label says so,
		 * since nothing else would.
		 */
		btn.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const current = this.editableField(fileNow(), key);
			if (current) openFieldSettings(this.plugin, current);
		});
		return btn;
	}

	/** An editable root field of `file`'s fileClass named `key`, if any.
	 * Obsidian lowercases `data-property-key`, so match case-insensitively. */
	private editableField(file: TFile, key: string): Field | undefined {
		const k = key.toLowerCase();
		return this.plugin.index
			.getFields(file)
			.find((f) => f.name.toLowerCase() === k && isRootField(f) && isInputSupported(f.type));
	}

	/** The note whose Properties editor contains `el`, or null if `el` is not
	 * in a real properties editor (e.g. a canvas card — skip those). */
	private fileForEl(el: HTMLElement): TFile | null {
		const ws = this.plugin.app.workspace;
		for (const leaf of ws.getLeavesOfType("markdown")) {
			const view = leaf.view as unknown as { containerEl?: HTMLElement; file?: TFile };
			if (view.file && view.containerEl?.contains(el)) return view.file;
		}
		// The file-properties sidebar tracks the active file.
		for (const leaf of ws.getLeavesOfType("file-properties")) {
			if (leaf.view.containerEl.contains(el)) return ws.getActiveFile();
		}
		// An embedded editor in a popover — the Bases *New* item, a hover preview — belongs to
		// no leaf. CodeMirror knows which document it is showing, which is the honest answer:
		// falling back to the active file would decorate a preview of another note with this
		// note's fields.
		const cm = el.closest<HTMLElement>(".cm-editor");
		const file = cm ? EditorView.findFromDOM(cm)?.state.field(editorInfoField, false)?.file : null;
		return file instanceof TFile ? file : null;
	}

	private removeAll(): void {
		for (const cls of [BTN_CLASS, PREVIEW_CLASS, ACTIONS_CLASS, CLASS_CLASS, FIELDS_ROW_CLASS]) {
			document.querySelectorAll(`.${cls}`).forEach((el) => el.remove());
		}
		// That row is Obsidian's own element, rewritten rather than added to: put its text back.
		document.querySelectorAll<HTMLElement>(`.${FIELDS_ROW_MARK}`).forEach((item) => {
			item.removeClass(FIELDS_ROW_MARK);
			delete item.dataset.fcFields;
			item.setText(item.dataset.fcRaw ?? "");
		});
	}
}
