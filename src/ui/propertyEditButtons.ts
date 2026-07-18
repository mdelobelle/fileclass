/*
 * Edit buttons in Obsidian's native Properties editor (ARCHITECTURE.md §19.6).
 * For each property row whose key is an editable field of the note's fileClass,
 * injects a small pencil between the key and the value that opens Fileclass's
 * typed input (updateField) — so users get validation/guided input from the
 * properties panel, like Metadata Menu.
 *
 * Another fragile DOM-injection boundary (like the indicators, §19.4): isolated
 * here, behind a setting, dedup-guarded, best-effort, removed on unload. Core
 * features never depend on it.
 */
import { Component, TFile, debounce, setIcon } from "obsidian";

import type FileclassPlugin from "../../main";
import { EditContext, updateField } from "../fields/fieldActions";
import { isInputSupported } from "../fields/support";
import { Field, isRootField } from "../schema/field";

const BTN_CLASS = "fileclass-prop-edit";
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
		if (!this.plugin.settings.enablePropertyEditButtons) return;
		try {
			document.querySelectorAll<HTMLElement>(".metadata-property[data-property-key]").forEach((row) => {
				this.injectRow(row);
			});
		} catch {
			/* a drifted selector must never break the app */
		}
	}

	private injectRow(row: HTMLElement): void {
		const key = row.getAttribute("data-property-key");
		const valueEl = row.querySelector<HTMLElement>(":scope > .metadata-property-value");
		if (!key || !valueEl) return;

		const file = this.fileForRow(row);
		const field = file && this.editableField(file, key);
		const existing = row.querySelector<HTMLElement>(`:scope > .${BTN_CLASS}`);

		if (!field) {
			existing?.remove(); // key no longer maps to an editable field
			return;
		}
		if (existing) {
			if (existing.dataset.fcKey === key) return; // up to date
			existing.remove();
		}
		row.insertBefore(this.makeButton(file, field, key), valueEl);
	}

	private makeButton(file: TFile, field: Field, key: string): HTMLElement {
		const btn = createSpan({ cls: `${BTN_CLASS} clickable-icon` });
		btn.dataset.fcKey = key;
		btn.setAttribute("aria-label", `Edit "${field.name}" (Fileclass)`);
		setIcon(btn, "square-pen");
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const ctx: EditContext = {
				host: this.plugin,
				file,
				allFields: this.plugin.index.getFields(file),
			};
			void updateField(ctx, field);
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

	/** The note whose Properties editor contains `row`, or null if `row` is not
	 * in a real properties editor (e.g. a canvas card — skip those). */
	private fileForRow(row: HTMLElement): TFile | null {
		const ws = this.plugin.app.workspace;
		for (const leaf of ws.getLeavesOfType("markdown")) {
			const view = leaf.view as unknown as { containerEl?: HTMLElement; file?: TFile };
			if (view.file && view.containerEl?.contains(row)) return view.file;
		}
		// The file-properties sidebar tracks the active file.
		for (const leaf of ws.getLeavesOfType("file-properties")) {
			if (leaf.view.containerEl.contains(row)) return ws.getActiveFile();
		}
		return null;
	}

	private removeAll(): void {
		document.querySelectorAll(`.${BTN_CLASS}`).forEach((el) => el.remove());
	}
}
