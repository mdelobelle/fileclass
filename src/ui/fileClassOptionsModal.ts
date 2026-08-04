/*
 * fileClass options editor (ARCHITECTURE.md §20.1). Edits a fileClass's options
 * and writes them in one processFrontMatter on Save, leaving `fields` and other
 * keys untouched. Reads current values from the live frontmatter (fresh).
 */
import { ButtonComponent, ExtraButtonComponent, Modal, Notice, Setting, TFile, debounce, normalizePath, parseYaml } from "obsidian";

import { modalTitle } from "./modalTitle";

import type FileclassPlugin from "../../main";
import { isRootField } from "../schema/field";
import { parseFileClass } from "../schema/fileClass";
import { writeOptions } from "../schema/fileClassIo";
import { buildOptionUpdates, EditableOptions } from "../schema/fileClassWrite";
import { applyBaseSync } from "../views/baseSync";
import { ClassScope, isBaseViewSynced } from "../views/baseYaml";
import { BaseFileSuggest } from "./baseSuggest";
import { openFileClassSchema } from "./fileClassSchemaModal";
import { IconSuggest, paintIcon } from "./iconSuggest";
import { MultiSelectModal } from "../fields/input/valueModals";
import { makeStickyFooter } from "./modalFooter";
import { attachUnsavedGuard, snapshot, UnsavedGuard } from "./unsavedGuard";

const csv = (v: string): string[] => v.split(",").map((s) => s.trim()).filter(Boolean);

export class FileClassOptionsModal extends Modal {
	private readonly opts: EditableOptions;
	private statusBtn?: ButtonComponent;
	/** The "open the parent's schema" affordance beside `Extends`. */
	private parentLink?: ExtraButtonComponent;
	/** The options as this modal opened on them, or as last saved. */
	private opened = "";
	private guard?: UnsavedGuard;
	/** Redraws the Excludes row — the parent it reads from can change under it. */
	private repaintExcludes?: () => void;
	private readonly refreshStatus = debounce(() => void this.updateStatus(), 250, true);

	constructor(
		private readonly plugin: FileclassPlugin,
		private readonly name: string,
		private readonly file: TFile
	) {
		super(plugin.app);
		const parsed = parseFileClass(name, this.app.metadataCache.getFileCache(file)?.frontmatter);
		const o = parsed.options;
		this.opts = {
			icon: o.icon,
			extends: o.extends,
			baseFile: o.baseFile,
			baseView: o.baseView,
			mapWithTag: o.mapWithTag,
			tagNames: o.tagNames,
			filesPaths: o.filesPaths,
			bookmarksGroups: o.bookmarksGroups,
			excludes: o.excludes,
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		this.opened = snapshot(this.opts);
		modalTitle(contentEl, `Options — ${this.name}`);

		/*
		 * `Extends` comes first, and not only because a parent is more structural than an
		 * icon: Obsidian focuses a modal's first focusable control, and the Icon field's
		 * suggester opens on focus — so this modal used to greet you with the icon picker,
		 * fifty suggestions up and staying. A dropdown taking that focus opens nothing.
		 *
		 * It is a **dropdown**, not a text field: a parent that doesn't exist inherits
		 * nothing, so there is no case for typing a free name. The list holds the classes you
		 * have, never this one, and never one that already inherits from it (a cycle).
		 *
		 * A value that no longer resolves — a hand-edited note, a class renamed or deleted —
		 * is kept in the list, marked, rather than quietly replaced by "no parent". Losing a
		 * declaration because its target went missing would be the worse failure.
		 *
		 * Beside it, a way through to the parent's schema: a class's editor lists its **own**
		 * fields only, since showing an ancestor's would beg the question of which copy you
		 * are editing.
		 */
		const parentRow = new Setting(contentEl)
			.setName("Extends")
			.setDesc("Parent fileClass — its fields are inherited by this one.");
		parentRow.addDropdown((d) => {
			const current = (this.opts.extends ?? "").trim();
			d.addOption("", "— no parent —");
			for (const name of this.parentCandidates().sort((a, b) => a.localeCompare(b))) {
				d.addOption(name, name);
			}
			if (current && !this.plugin.index.fileClassNames.includes(current)) {
				d.addOption(current, `${current} (no such fileClass)`);
			}
			d.setValue(current).onChange((v) => {
				this.opts.extends = v;
				this.refreshParentLink();
				this.repaintExcludes?.();
			});
		});
		parentRow.addExtraButton((b) => {
			this.parentLink = b;
			b.setIcon("external-link").onClick(() => {
				const name = (this.opts.extends ?? "").trim();
				if (name) openFileClassSchema(this.plugin, name);
			});
		});
		this.refreshParentLink();

		// Directly under the parent it depends on: what `Excludes` offers is the parent's own
		// fields, so the two rows only make sense read together.
		this.excludesSetting();

		const iconSetting = new Setting(contentEl).setName("Icon").setDesc("Lucide icon name.");
		const preview = iconSetting.controlEl.createSpan({ cls: "fileclass-icon-preview" });
		const fallback = this.plugin.settings.fileClassIcon;
		const paintPreview = (v: string) => paintIcon(preview, v.trim() || fallback);
		iconSetting.addText((t) => {
			t.setValue(this.opts.icon ?? "").onChange((v) => {
				this.opts.icon = v;
				paintPreview(v);
				this.guard?.refresh();
			});
			new IconSuggest(this.app, t.inputEl);
		});
		paintPreview(this.opts.icon ?? "");

		new Setting(contentEl).setName("Sync to base").setHeading();
		new Setting(contentEl)
			.setName("Base file")
			.setDesc("A .base whose managed view mirrors this fileClass's fields. Blank to disable.")
			.addText((t) => {
				t.setValue(this.opts.baseFile ?? "").onChange((v) => {
					this.opts.baseFile = v;
					this.refreshStatus();
				});
				new BaseFileSuggest(this.app, t.inputEl);
			});
		new Setting(contentEl)
			.setName("View name")
			.setDesc(`Managed view in the base (default: ${this.name}).`)
			.addText((t) =>
				t.setValue(this.opts.baseView ?? "").onChange((v) => {
					this.opts.baseView = v;
					this.refreshStatus();
				})
			);
		new Setting(contentEl)
			.setName("Base structure")
			.setDesc("Whether the managed view matches the fileClass fields.")
			.addButton((b) => {
				this.statusBtn = b;
				b.onClick(() => void this.doSync());
			});

		new Setting(contentEl)
			.setName("Map with tag")
			.setDesc("Bind notes tagged with this fileClass's name.")
			.addToggle((t) =>
				t.setValue(!!this.opts.mapWithTag).onChange((v) => {
					this.opts.mapWithTag = v;
					void this.updateStatus();
				})
			);

		this.csvSetting("Tag names", "tagNames");
		this.csvSetting("Files paths", "filesPaths");
		this.csvSetting("Bookmark groups", "bookmarksGroups");

		/*
		 * The same guard every other editing modal here carries: this one holds a draft of a
		 * class's options and commits it on Save, so Escape used to throw a changed parent or
		 * a new binding away without a word. `opened` is the comparison point, and it moves
		 * to what was last written — otherwise Save would commit and then ask.
		 */
		const footerRow = new Setting(makeStickyFooter(contentEl));
		const commit = (): boolean => {
			const updates = buildOptionUpdates(this.opts);
			this.opened = snapshot(this.opts);
			void writeOptions(this.app, this.file, updates).then(() => this.close());
			return true;
		};
		this.guard = attachUnsavedGuard(this.app, this, {
			isDirty: () => snapshot(this.opts) !== this.opened,
			save: commit,
			subject: "options",
		});
		this.guard.mountHint(footerRow.settingEl);
		// One hook rather than one per control: this form has eight of them and will grow, and
		// a hint that only some of them light up is worse than none. `input` covers the text
		// boxes, `change` the dropdown and the toggles.
		for (const type of ["input", "change"]) {
			contentEl.addEventListener(type, () => this.guard?.refresh());
		}
		footerRow.addButton((b) => b.setButtonText("Save").setCta().onClick(() => void commit()));

		void this.updateStatus();
	}

	/** Sync status of the managed view against the form's current base/view. */
	private async computeStatus(): Promise<"none" | "synced" | "diverged"> {
		const baseFile = this.opts.baseFile?.trim();
		if (!baseFile) return "none";
		const file = this.app.vault.getFileByPath(normalizePath(baseFile));
		if (!(file instanceof TFile)) return "diverged"; // missing → Sync creates it
		try {
			const base: unknown = parseYaml(await this.app.vault.read(file));
			const view = this.opts.baseView?.trim() || this.name;
			const fields = this.plugin.index
				.getResolvedFields(this.name)
				.filter((f) => isRootField(f))
				.map((f) => f.name);
			// The scope comes from the form, not from the saved note: the status must
			// answer "would Sync change anything?" for what is on screen now.
			return isBaseViewSynced(base, view, fields, this.draftScope()) ? "synced" : "diverged";
		} catch {
			return "diverged";
		}
	}

	/** What binds a note to this class, per the options currently in the form. */
	private draftScope(): ClassScope {
		const tags = [...(this.opts.tagNames ?? [])];
		if (this.opts.mapWithTag && !this.name.includes(" ")) tags.push(this.name);
		return {
			alias: this.plugin.settings.fileClassAlias,
			name: this.name,
			tags,
			folders: this.opts.filesPaths ?? [],
		};
	}

	private async updateStatus(): Promise<void> {
		if (!this.statusBtn) return;
		const status = await this.computeStatus();
		const b = this.statusBtn;
		if (status === "none") b.setButtonText("No base set").setDisabled(true).removeCta();
		else if (status === "synced") b.setButtonText("Synced").setDisabled(true).removeCta();
		else b.setButtonText("Sync").setDisabled(false).setCta();
	}

	private async doSync(): Promise<void> {
		const path = this.opts.baseFile?.trim();
		if (!path) return;
		// Persist config, then apply with explicit path/view (cache may lag).
		await writeOptions(this.app, this.file, buildOptionUpdates(this.opts));
		await applyBaseSync(
			this.plugin,
			this.name,
			normalizePath(path),
			this.opts.baseView?.trim() || this.name
		);
		await this.updateStatus();
	}

	/**
	 * Shows the way through to the parent only when there is a parent to reach: the name
	 * must be a fileClass the index knows. Its tooltip names the class, so the button says
	 * where it goes rather than that it goes somewhere.
	 */
	private refreshParentLink(): void {
		if (!this.parentLink) return;
		const name = (this.opts.extends ?? "").trim();
		const exists = !!name && this.plugin.index.fileClassNames.includes(name);
		this.parentLink.extraSettingsEl.toggleClass("is-hidden-fc", !exists);
		this.parentLink.setTooltip(exists ? `Open "${name}"'s schema` : "");
	}

	/**
	 * The classes this one may extend: every fileClass except itself and its own
	 * descendants. A descendant as a parent is a cycle — `computeAncestors` survives one,
	 * but a suggester should not propose it.
	 */
	private parentCandidates(): string[] {
		const index = this.plugin.index;
		return index.fileClassNames.filter(
			(name) => name !== this.name && !index.getAncestors(name).includes(this.name)
		);
	}

	/**
	 * `Excludes` — the inherited fields this class drops — picked from the parent's own
	 * fields rather than typed.
	 *
	 * It used to be a comma-separated box, where a misspelling excluded nothing and said
	 * nothing: the same silence `Extends` had. What a class can exclude is a finite, known
	 * list — its ancestors' field names — so the list is the interface. A name that no longer
	 * resolves (the parent changed, the note was hand-edited) is kept and marked, because
	 * dropping it would silently re-inherit a field somebody deliberately excluded.
	 */
	private excludesSetting(): void {
		const row = new Setting(this.contentEl).setName("Excludes");
		const paint = () => {
			const chosen = this.opts.excludes ?? [];
			const available = this.inheritedFieldNames();
			row.setDesc(
				available.length
					? chosen.length
						? `Dropped from ${this.opts.extends}: ${chosen.join(", ")}`
						: `Inherited fields to drop. ${available.length} available from ${this.opts.extends}.`
					: "Nothing to exclude: this class has no parent."
			);
		};
		row.addButton((b) =>
			b.setButtonText("Choose…").onClick(() => {
				const available = this.inheritedFieldNames();
				const chosen = this.opts.excludes ?? [];
				// A stale exclusion stays offered, so saving cannot quietly undo it.
				const allowed = [...available, ...chosen.filter((n) => !available.includes(n))];
				if (!allowed.length) {
					new Notice("Fileclass: no parent, so there is nothing to exclude.");
					return;
				}
				new MultiSelectModal(this.app, {
					title: `Excludes — inherited by ${this.name}`,
					allowed,
					selected: chosen,
					onSubmit: (values) => {
						this.opts.excludes = values;
						paint();
						this.guard?.refresh();
						void this.updateStatus();
					},
				}).open();
			})
		);
		paint();
		this.repaintExcludes = paint;
	}

	/** The field names this class inherits — what it may exclude, and nothing else. */
	private inheritedFieldNames(): string[] {
		const parent = (this.opts.extends ?? "").trim();
		if (!parent || !this.plugin.index.fileClassNames.includes(parent)) return [];
		return this.plugin.index
			.getResolvedFields(parent)
			.filter((f) => !f.path)
			.map((f) => f.name);
	}

	private csvSetting(
		name: string,
		key: "tagNames" | "filesPaths" | "bookmarksGroups" | "excludes",
		desc = "Comma-separated."
	): void {
		new Setting(this.contentEl)
			.setName(name)
			.setDesc(desc)
			.addText((t) =>
				t.setValue((this.opts[key] ?? []).join(", ")).onChange((v) => {
					this.opts[key] = csv(v);
					// filesPaths/tagNames decide what the view filters on, so the Sync
					// button has to light up as soon as they change.
					void this.updateStatus();
				})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
