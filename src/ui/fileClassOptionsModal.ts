/*
 * fileClass options editor (ARCHITECTURE.md §20.1). Edits a fileClass's options
 * and writes them in one processFrontMatter on Save, leaving `fields` and other
 * keys untouched. Reads current values from the live frontmatter (fresh).
 */
import { BookmarkItem, ButtonComponent, ExtraButtonComponent, Modal, Notice, Setting, TFile, TFolder, debounce, normalizePath, parseYaml } from "obsidian";

import { modalTitle } from "./modalTitle";

import type FileclassPlugin from "../../main";
import { isRootField } from "../schema/field";
import { parseFileClass } from "../schema/fileClass";
import { writeOptions } from "../schema/fileClassIo";
import { buildOptionUpdates, EditableOptions } from "../schema/fileClassWrite";
import { applyBaseSync, fileClassClaimingView } from "../views/baseSync";
import { ClassScope, isBaseViewSynced } from "../views/baseYaml";
import { BaseFileSuggest } from "./baseSuggest";
import { confirmRemoveDestination, editNoteDestination } from "./noteDestinationModal";
import { destinationLabel, noteDestinations } from "../schema/newNote";
import { openFileClassSchema } from "./fileClassSchemaModal";
import { confirmRemoveRelatedView, editRelatedView, relatedViewLabel } from "./relatedViewModal";
import { withRelatedView } from "../views/reverseView";
import { IconSuggest, paintIcon } from "./iconSuggest";
import { MultiSelectModal } from "../fields/input/valueModals";
import { makeStickyFooter } from "./modalFooter";
import { attachUnsavedGuard, snapshot, UnsavedGuard } from "./unsavedGuard";

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
			// Read from either spelling, written as the list: opening and saving a class configured
			// with 0.2.13's single pair migrates it, without a second way to configure being kept.
			newNotes: noteDestinations(o),
			relatedViews: o.relatedViews,
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
		/*
		 * The headings carry no description: one line each looked helpful and cost three rows of
		 * a modal that was already scrolling, to restate what `Identity`, `Bound notes` and
		 * `Sync to base` say on their own. The line that did carry a fact — that the binding
		 * lists were comma-separated — went with the boxes it described, now that they are
		 * pickers (#121).
		 */
		new Setting(contentEl).setName("Identity").setHeading();
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

		/*
		 * Three sections, each holding only what its title covers. `Sync to base` used to be
		 * the modal's single heading, sitting above the base rows AND the four bindings — so
		 * `Map with tag` and the three lists read as base settings, which they have never been.
		 *
		 * The order is the order of the questions: what is this class, which notes carry it,
		 * and where are its fields mirrored. The base section comes last so its action button
		 * sits next to Save.
		 */
		new Setting(contentEl)
			.setName("Bound notes")
			.setHeading();
		new Setting(contentEl)
			.setName("Map with tag")
			.setDesc("Bind notes tagged with this fileClass's name.")
			.addToggle((t) =>
				t.setValue(!!this.opts.mapWithTag).onChange((v) => {
					this.opts.mapWithTag = v;
					void this.updateStatus();
				})
			);
		this.bindingPicker("Tag names", "tagNames", () => this.vaultTags());
		this.bindingPicker("Files paths", "filesPaths", () => this.vaultFolders());
		this.bindingPicker("Bookmark groups", "bookmarksGroups", () => this.bookmarkGroups());

		new Setting(contentEl).setName("New notes").setHeading();
		this.destinationList(contentEl);

		new Setting(contentEl).setName("Related views").setHeading();
		this.relatedViewList(contentEl);

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
		const view = this.opts.baseView?.trim() || this.name;
		const taken = fileClassClaimingView(this.plugin, path, view, this.name);
		if (taken) {
			new Notice(
				`Fileclass: "${taken}" already mirrors into ${path} › ${view}. ` +
					"Give this one a view name of its own."
			);
			return;
		}
		// Persist config, then apply with explicit path/view (cache may lag).
		await writeOptions(this.app, this.file, buildOptionUpdates(this.opts));
		await applyBaseSync(this.plugin, this.name, normalizePath(path), view);
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

	/**
	 * One of the three binding lists — the tags, folders or bookmark groups whose notes this
	 * class claims — picked from what the vault holds rather than typed (#121).
	 *
	 * They were comma-separated boxes, where a misspelled tag bound nothing and said nothing:
	 * the silence `Extends` and `Excludes` were cured of. Everything a person can write in
	 * them already exists in the vault, so the vault is the list.
	 *
	 * A value that matches nothing **stays**, marked, and is still offered: a folder can be
	 * renamed, a tag can fall out of use for a week, and dropping the binding on sight would
	 * quietly untype every note it reached.
	 */
	/**
	 * The class's destinations, one row each, then an "Add new".
	 *
	 * Rows carry the **basenames** — `Contacts › Person (pro)` — because the folder and template
	 * paths repeat a prefix that distinguishes nothing, and the part the reader chose is the last
	 * segment. The full paths are one click away, in the editor that wrote them.
	 */
	private destinationList(container: HTMLElement): void {
		const host = container.createDiv({ cls: "fileclass-destinations" });
		const paint = (): void => {
			host.empty();
			const list = this.opts.newNotes ?? [];
			if (!list.length) {
				new Setting(host).setDesc(
					"None yet. Without one, a new note goes to the class's single bound folder — or Obsidian's " +
						"default — and starts from nothing but its schema."
				);
			}
			list.forEach((destination, index) => {
				const row = new Setting(host).setName(destinationLabel(destination));
				// The paths, since the row deliberately shows neither.
				row.setDesc(
					[destination.folder, destination.template].filter(Boolean).join("  ·  ") || "no folder, no template"
				);
				row.addExtraButton((b) =>
					b
						.setIcon("pencil")
						.setTooltip("Edit")
						.onClick(() => {
							void editNoteDestination(this.plugin, destination, true).then((edited) => {
								if (!edited) return;
								const next = [...(this.opts.newNotes ?? [])];
								next[index] = edited;
								this.opts.newNotes = next;
								paint();
								this.guard?.refresh();
							});
						})
				);
				row.addExtraButton((b) =>
					b
						.setIcon("trash-2")
						.setTooltip("Remove")
						.onClick(() => {
							void confirmRemoveDestination(this.plugin, destinationLabel(destination)).then((yes) => {
								if (!yes) return;
								this.opts.newNotes = (this.opts.newNotes ?? []).filter((_, i) => i !== index);
								paint();
								this.guard?.refresh();
							});
						})
				);
			});
			new Setting(host).addButton((b) =>
				b.setButtonText("Add new").onClick(() => {
					void editNoteDestination(this.plugin).then((added) => {
						if (!added) return;
						this.opts.newNotes = [...(this.opts.newNotes ?? []), added];
						paint();
						this.guard?.refresh();
					});
				})
			);
		};
		paint();
	}

	/**
	 * The class's declared relations, one row each, then an "Add new".
	 *
	 * The other door to something that could only be entered from a base view — and the only one
	 * that lets you leave: until now a declaration could be made by running *Use this view for a
	 * relation* over the view, and removed only by editing the frontmatter by hand.
	 */
	private relatedViewList(container: HTMLElement): void {
		const host = container.createDiv({ cls: "fileclass-related-list" });
		const paint = (): void => {
			host.empty();
			const list = this.opts.relatedViews ?? [];
			if (!list.length) {
				new Setting(host).setDesc(
					"None yet. A related view is the view that lists the notes pointing at this class through " +
						"one of its link fields — it is what an embedded relation table shows, and what makes its " +
						"New button fill the link in."
				);
			}
			list.forEach((entry, index) => {
				const row = new Setting(host).setName(relatedViewLabel(entry));
				row.setDesc(entry.view);
				row.addExtraButton((b) =>
					b
						.setIcon("pencil")
						.setTooltip("Edit")
						.onClick(() => {
							void editRelatedView(this.plugin, this.name, entry).then((edited) => {
								if (!edited) return;
								const next = [...(this.opts.relatedViews ?? [])];
								next[index] = edited;
								this.opts.relatedViews = next;
								paint();
								this.guard?.refresh();
							});
						})
				);
				row.addExtraButton((b) =>
					b
						.setIcon("trash-2")
						.setTooltip("Remove")
						.onClick(() => {
							void confirmRemoveRelatedView(this.plugin, relatedViewLabel(entry)).then((yes) => {
								if (!yes) return;
								this.opts.relatedViews = (this.opts.relatedViews ?? []).filter((_, i) => i !== index);
								paint();
								this.guard?.refresh();
							});
						})
				);
			});
			new Setting(host).addButton((b) =>
				b.setButtonText("Add new").onClick(() => {
					void editRelatedView(this.plugin, this.name).then((added) => {
						if (!added) return;
						// The pair is the identity, here as in the writers: a field may be read backwards by
						// several views, and declaring the same one twice is a no-op.
						this.opts.relatedViews = withRelatedView(this.opts.relatedViews ?? [], added.field, added.view);
						paint();
						this.guard?.refresh();
					});
				})
			);
		};
		paint();
	}

	private bindingPicker(
		name: string,
		key: "tagNames" | "filesPaths" | "bookmarksGroups",
		source: () => { available: string[]; nothing: string; unit: string }
	): void {
		const row = new Setting(this.contentEl).setName(name);
		const paint = () => {
			const chosen = this.opts[key] ?? [];
			const { available, nothing, unit } = source();
			// A kept binding that matches nothing today is *said* to match nothing. Keeping it
			// silently would be its own trap: the row would read exactly like a working one
			// while claiming no note at all — which is the silence this whole picker was built
			// to end. A renamed folder, a tag nobody uses any more; the value stays, the row
			// tells you.
			const shown = chosen.map((v) => (available.includes(v) ? v : `${v} (matches nothing)`));
			row.setDesc(
				shown.length
					? shown.join(", ")
					: available.length
						? `Nothing yet. ${available.length} ${unit} in this vault.`
						// The same sentence serves as a Notice ("Fileclass: no tag is …"), where it
						// follows a colon, and as a row description, where it opens a line.
						: nothing.charAt(0).toUpperCase() + nothing.slice(1)
			);
		};
		row.addButton((b) =>
			b.setButtonText("Choose…").onClick(() => {
				const { available, nothing } = source();
				const chosen = this.opts[key] ?? [];
				// A stale binding stays offered, so saving cannot quietly drop it.
				const allowed = [...available, ...chosen.filter((v) => !available.includes(v))];
				if (!allowed.length) {
					new Notice(`Fileclass: ${nothing}`);
					return;
				}
				new MultiSelectModal(this.app, {
					title: `${name} — ${this.name}`,
					allowed,
					selected: chosen,
					disabledReason: key === "filesPaths" ? (v) => this.classFolderReason(v) : undefined,
					onSubmit: (values) => {
						this.opts[key] = values;
						paint();
						this.guard?.refresh();
						// filesPaths/tagNames decide what a generated view filters on, so the
						// Sync button has to light up as soon as they change.
						void this.updateStatus();
					},
				}).open();
			})
		);
		paint();
	}

	/** Every tag in the vault, without its `#`, most used first. */
	private vaultTags(): { available: string[]; nothing: string; unit: string } {
		const counts = this.app.metadataCache.getTags();
		const available = Object.entries(counts)
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([tag]) => tag.replace(/^#/, ""));
		return { available, nothing: "no tag is used in this vault yet.", unit: "tags" };
	}

	/**
	 * Why the class folder cannot be bound as a *Files paths* target.
	 *
	 * Binding it would make every class note a note **of** that class: the schemas would
	 * start validating each other, and a class note would appear in its own table. The row
	 * stays in the list, greyed and explained — a folder missing without a word would send the
	 * reader looking for it.
	 */
	private classFolderReason(folder: string): string | null {
		const classes = this.plugin.settings.classFilesPath.replace(/\/+$/, "");
		if (!classes || folder.replace(/\/+$/, "") !== classes) return null;
		return "Your class notes live here — binding it would make every class a note of this class.";
	}

	/** The vault's folders. The root is left out: binding it would claim every note. */
	private vaultFolders(): { available: string[]; nothing: string; unit: string } {
		const available = this.app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder && !f.isRoot())
			.map((f) => f.path)
			.sort((a, b) => a.localeCompare(b));
		return { available, nothing: "this vault has no folder.", unit: "folders" };
	}

	/** Bookmark groups, nested ones as `parent/child`, from the core plugin. */
	private bookmarkGroups(): { available: string[]; nothing: string; unit: string } {
		const nothing = "the Bookmarks core plugin has no group (or is disabled).";
		const instance = this.app.internalPlugins?.plugins?.bookmarks?.instance;
		const items = instance?.getBookmarks?.() ?? [];
		const walk = (list: BookmarkItem[], prefix: string): string[] =>
			list.flatMap((item) =>
				item.type === "group"
					? [
							`${prefix}${item.title ?? ""}`,
							...walk(item.items ?? [], `${prefix}${item.title ?? ""}/`),
						]
					: []
			);
		return { available: walk(items, "").filter(Boolean), nothing, unit: "groups" };
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
