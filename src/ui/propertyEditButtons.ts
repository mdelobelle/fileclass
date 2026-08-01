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
import { Component, TFile, debounce, setIcon } from "obsidian";

import type FileclassPlugin from "../../main";
import { insertMissingFields } from "../commands/insertMissingFields";
import { missingRootFields } from "../fields/missingFields";
import { controlActionFor, controlLabel } from "../fields/controlAction";
import { EditContext, nextDateActionFor, runControlAction } from "../fields/fieldActions";
import { isInputSupported } from "../fields/support";
import { fieldTypeIcon } from "../fields/typeIcons";
import { Field, isRootField } from "../schema/field";
import { hasFieldKey } from "../io/read";
import { AddFileClassModal } from "./addFileClassModal";
import { attachAltAffordance } from "./altAffordance";
import { openFileClassSchema } from "./fileClassSchemaModal";
import { makeValuePreview } from "./valuePreview";

const BTN_CLASS = "fileclass-prop-edit";
const PREVIEW_CLASS = "fileclass-prop-preview";
/** The section-actions wrapper, sitting right after "Add property". */
const ACTIONS_CLASS = "fileclass-prop-actions";
/** The "open this class's schema" button, on the fileClass row (#23). */
const CLASS_CLASS = "fileclass-prop-class";
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
	 * "Add a class" and "Insert N missing fields", as siblings of the native
	 * "Add property" button (which is inline-flex, so they land on its line).
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

		const fields = this.plugin.index.getFields(file);
		const bound = this.plugin.index.getFileClasses(file).length;
		const missing = bound
			? missingRootFields(fields, (f) => hasFieldKey(this.plugin.app, file, f))
			: [];
		const state = `${file.path}:${bound}:${missing.length}`;
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
		add.after(wrapper);
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
		btn.setAttribute("aria-label", `${hint} (Fileclass)`);
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
		btn.setAttribute("aria-label", `Open "${name}" schema (Fileclass)`);
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
		if (!button || button.dataset.fcKey !== key) {
			button?.remove();
			button = this.makeButton(file, field, key);
			row.insertBefore(button, valueEl);
		}
		// Type preview (Color swatch / Icon glyph) right after the button (between
		// it and the value). Dedup by key+value so a settled row triggers no
		// further DOM mutation (the row is watched — re-injecting every run loops).
		const value = (valueEl.textContent ?? "").trim();
		if (
			!existingPreview ||
			existingPreview.dataset.fcKey !== key ||
			existingPreview.dataset.fcValue !== value
		) {
			existingPreview?.remove();
			const preview = makeValuePreview(field, value);
			if (preview) {
				preview.addClass(PREVIEW_CLASS);
				preview.dataset.fcKey = key;
				preview.dataset.fcValue = value;
				button.after(preview);
			}
		}
	}

	private makeButton(file: TFile, field: Field, key: string): HTMLElement {
		const btn = createSpan({ cls: `${BTN_CLASS} clickable-icon` });
		btn.dataset.fcKey = key;
		// The label names the gesture this type performs, not a generic "edit":
		// a Cycle advances and a Boolean flips, here as in every other surface.
		const ctxOf = (): EditContext => ({
			host: this.plugin,
			file,
			allFields: this.plugin.index.getFields(file),
		});
		const { verb, alt } = controlLabel(controlActionFor(field.type));
		const icon = fieldTypeIcon(field.type);
		let hint = alt ? " (Alt-click to pick a value)" : "";
		// A date wired to an interval sequence advances on Alt-click, so its button
		// says so — and shows the date it would write while Alt is held.
		const hasNextDate = !!nextDateActionFor(ctxOf(), field);
		if (hasNextDate) hint = " (Alt-click to set the next date)";
		const label = `${verb} "${field.name}" — ${field.type} (Fileclass)${hint}`;
		btn.setAttribute("aria-label", label);
		setIcon(btn, icon);
		if (hasNextDate) {
			attachAltAffordance(btn, { icon, label }, () => {
				const next = nextDateActionFor(ctxOf(), field);
				return next
					? {
							icon: "skip-forward",
							label: `Set "${field.name}" to ${next.next} (+${next.interval}) (Fileclass)`,
						}
					: null;
			});
		}
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			void runControlAction(ctxOf(), field, { alt: e.altKey });
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
		return null;
	}

	private removeAll(): void {
		for (const cls of [BTN_CLASS, PREVIEW_CLASS, ACTIONS_CLASS, CLASS_CLASS]) {
			document.querySelectorAll(`.${cls}`).forEach((el) => el.remove());
		}
	}
}
