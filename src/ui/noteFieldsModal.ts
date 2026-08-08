/*
 * Note-fields modal (ARCHITECTURE.md §19.1). The single hub for a note's
 * fields: lists its resolved root fields with their current values and, per
 * field, the gesture its type performs (advance / toggle / edit) plus Clear, and
 * header actions. All editing reuses the P2 dispatcher (runControlAction /
 * clearField) — no new write path. Re-renders on
 * metadata changes so edits made through sub-modals show immediately.
 */
import { EventRef, Modal, Notice, Setting, setIcon, TFile } from "obsidian";

import { modalTitle } from "./modalTitle";
import { attachRowGrid } from "./rowGridKeyboard";

import type FileclassPlugin from "../../main";
import { insertMissingFields } from "../commands/insertMissingFields";
import { reorderFrontmatter } from "../io/reorderFrontmatter";
import { reorderPlan } from "../schema/reorder";
import { describeOrigin } from "../schema/resolver";
import { makeDisplayDeps } from "../fields/displayDeps";
import { controlActionFor, controlLabel } from "../fields/controlAction";
import {
	clearField,
	EditContext,
	nextDateActionFor,
	runControlAction,
} from "../fields/fieldActions";
import { isEmpty, isRequired } from "../fields/validate";
import { describeField, DisplayDeps } from "../fields/objectDisplay";
import { isInputSupported } from "../fields/support";
import { fieldTypeIcon } from "../fields/typeIcons";
import { INDEXED_EVENT } from "../schema/fileclassIndex";
import { readFieldValue } from "../io/read";
import { Field, isRootField } from "../schema/field";
import { AddFileClassModal } from "./addFileClassModal";
import { openFileClassSchema } from "./fileClassSchemaModal";
import { attachAltAffordance } from "./altAffordance";
import { openFieldSettings } from "./fieldSettings";
import { makeValuePreview } from "./valuePreview";
import { makeIndicatorIcon, MODAL_SCOPE, navIndicatorFile } from "./indicator/indicatorDom";
import { renderValueWithLinks } from "./valueLinks";

export class NoteFieldsModal extends Modal {
	private changeRef?: EventRef;
	private indexRef?: EventRef;

	constructor(private readonly plugin: FileclassPlugin, private readonly file: TFile) {
		super(plugin.app);
	}

	onOpen(): void {
		this.render();
		// Reflect writes (including those from sub-modals) as they land.
		this.changeRef = this.app.metadataCache.on("changed", (f) => {
			if (f.path === this.file.path) this.render();
		});
		// Re-render on schema changes too, so edits to a field's definition
		// (e.g. a Select's allowed values) are picked up by the row's controls.
		this.indexRef = this.plugin.index.on(INDEXED_EVENT, () => this.render());
	}

	onClose(): void {
		this.detachGrid?.();
		if (this.changeRef) this.app.metadataCache.offref(this.changeRef);
		if (this.indexRef) this.plugin.index.offref(this.indexRef);
		this.contentEl.empty();
	}

	/** Detaches the arrow-key grid of the current render. */
	private detachGrid?: () => void;

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		modalTitle(contentEl, `Fields — ${this.file.basename}`);

		const fields = this.plugin.index.getFields(this.file);
		const ctx: EditContext = { host: this.plugin, file: this.file, allFields: fields };
		const deps = makeDisplayDeps(fields);
		const rootFields = fields.filter((f) => isRootField(f));

		if (!rootFields.length) {
			contentEl.createEl("p", { text: "No fields apply to this note." });
		}

		// The field rows in their own container: the arrow keys walk them without
		// reaching "Insert missing fields" or the fileClass footer.
		const listEl = contentEl.createDiv({ cls: "fileclass-field-list" });
		for (const field of rootFields) {
			this.renderFieldRow(ctx, deps, field, listEl);
		}

		this.detachGrid?.();
		this.detachGrid = attachRowGrid(listEl, {
			rowSelector: ":scope > .setting-item",
			actionSelector: "button, .clickable-icon",
			preferred: "Edit",
		});

		const actions = new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText("Insert missing fields")
					.onClick(() => void insertMissingFields(this.app, this.file, fields))
			)
			.addButton((b) =>
				b
					.setButtonText("Add fileClass")
					.onClick(() => new AddFileClassModal(this.plugin, this.file).open())
			);
		/*
		 * Only when the file disagrees with the class (#104). This modal already lists fields
		 * in the class's order — that is the point of it — so the button changes nothing here;
		 * what it fixes is the note on disk, and everything that reads the note raw: source
		 * mode, git, and any other tool. The button leaves once the two agree, which is the
		 * only feedback the modal itself can give.
		 */
		if (this.isOutOfOrder(fields)) {
			actions.addButton((b) =>
				b
					.setButtonText("Reorder properties")
					.setTooltip("Put this note's properties back in the order its class declares them")
					.onClick(() => void this.reorderProperties(fields))
			);
		}

		this.renderFileClassFooter();
	}

	/** Footer: each applied fileClass as an inheritance breadcrumb (clickable). */
	private renderFileClassFooter(): void {
		const names = this.plugin.index.getFileClasses(this.file);
		if (!names.length) return;

		const footer = this.contentEl.createDiv({ cls: "fileclass-modal-footer" });
		const origins = this.plugin.index.getBindingOrigins(this.file);
		for (const name of names) {
			const crumb = footer.createDiv({ cls: "fileclass-breadcrumb" });
			// Root → leaf: ancestors are nearest-first, so reverse then add self.
			const chain = [...this.plugin.index.getAncestors(name)].reverse();
			chain.push(name);
			chain.forEach((cls, i) => {
				if (i > 0) crumb.createSpan({ cls: "fileclass-breadcrumb-sep", text: "›" });
				const link = crumb.createEl("a", {
					cls: "fileclass-breadcrumb-item",
					text: cls,
					href: "#",
				});
				link.dataset.fcClass = cls; // so a hovered row can find the class it comes from
				link.addEventListener("click", (e) => {
					e.preventDefault();
					openFileClassSchema(this.plugin, cls, () => this.close());
				});
				// Hovering a fileClass marks the rows of the fields it declares.
				link.addEventListener("mouseenter", () => this.highlightOwner(cls));
				link.addEventListener("mouseleave", () => this.highlightOwner(null));
			});
			/*
			 * Where this class came from, when the note does not say. Three of the four routes
			 * leave nothing in the file — a tag, a folder, a bookmark group — so a note can
			 * carry a class with an empty frontmatter and no way to find out which option, on
			 * which class, claimed it. The crumb answers on the spot: `Media › Book
			 * (from /Reading list)`. Nothing is added when the note names the class itself,
			 * which is the case that needs no explaining.
			 */
			const origin = origins.get(name);
			const from = origin && origin.kind !== "frontmatter" ? describeOrigin(origin) : "";
			if (from) {
				crumb.createSpan({ cls: "fileclass-breadcrumb-origin", text: `(from ${from})` });
			}
		}
	}

	/** Marks field rows declared by `name` (footer hover); null clears. */
	private highlightOwner(name: string | null): void {
		this.contentEl.querySelectorAll<HTMLElement>(".fileclass-field-row").forEach((row) => {
			row.toggleClass("is-fc-highlight", name !== null && row.dataset.fcOwner === name);
		});
	}

	/**
	 * The other direction: hovering a row marks the class the field comes from, in the footer.
	 *
	 * The footer already answered "which fields does this class declare?"; a note bound to
	 * three classes left the opposite question — "where does *this* field come from?" — to a
	 * tooltip. Marked in every breadcrumb the class appears in, since an ancestor like `Media`
	 * legitimately shows up under each of its children.
	 */
	private highlightSourceClass(name: string | null): void {
		this.contentEl
			.querySelectorAll<HTMLElement>(".fileclass-breadcrumb-item")
			.forEach((link) => {
				link.toggleClass("is-fc-owner", name !== null && link.dataset.fcClass === name);
			});
	}

	private renderFieldRow(
		ctx: EditContext,
		deps: DisplayDeps,
		field: Field,
		parent?: HTMLElement
	): void {
		const raw = readFieldValue(this.app, this.file, field);
		const value = describeField(field, raw, deps);
		// Compact row: the type is shown as a leading icon, not a text label.
		const setting = new Setting(parent ?? this.contentEl).setName(field.name);
		setting.settingEl.addClass("fileclass-field-row");
		setting.settingEl.dataset.fcOwner = field.fileClassName; // for footer hover highlight
		// And the reciprocal: this row says, in the footer, which class it comes from.
		setting.settingEl.addEventListener("mouseenter", () =>
			this.highlightSourceClass(field.fileClassName)
		);
		setting.settingEl.addEventListener("mouseleave", () => this.highlightSourceClass(null));
		const typeIcon = createSpan({ cls: "fileclass-type-icon" });
		const typeLabel = `${field.type} — Alt-click for this field's settings`;
		typeIcon.setAttribute("aria-label", typeLabel);
		setIcon(typeIcon, fieldTypeIcon(field.type));
		// Alt turns the type icon into a way into the definition editor: changing one
		// option of a field you are looking at shouldn't mean leaving the note, opening
		// its fileClass and finding the field again.
		attachAltAffordance(
			typeIcon,
			{ icon: fieldTypeIcon(field.type), label: typeLabel },
			() => ({ icon: "wrench", label: `Fileclass: Edit "${field.name}" settings` })
		);
		typeIcon.addEventListener("click", (e) => {
			if (!e.altKey) return;
			e.preventDefault();
			e.stopPropagation();
			openFieldSettings(this.plugin, field);
		});
		setting.nameEl.prepend(typeIcon);

		const valueEl = setting.controlEl.createSpan({ cls: "fileclass-field-value" });
		if (value) valueEl.setAttribute("title", value); // full value on hover (truncated)
		renderValueWithLinks(valueEl, value, this.file.path, this.app, (linktext) =>
			this.linkIndicator(linktext)
		);
		const preview = makeValuePreview(field, value, {
			app: this.app,
			sourcePath: this.file.path,
			raw,
		});
		if (preview) valueEl.prepend(preview);


		// A required field with nothing in it colours its own action, rather than adding a
		// chip beside the value: the affordance you would use to fix it is the one that
		// says something is missing. A word in a red box was tried first and looked like
		// an error banner sitting in a table.
		this.addRowActions(ctx, setting, field, isRequired(field) && isEmpty(raw));
	}

	/**
	 * Right-side quick actions. The gesture and its label come from the shared
	 * mapping (controlAction.ts), so this modal, the Properties buttons and the
	 * table cells all do the same thing to a given type — and Alt-click opens the
	 * input wherever the gesture writes a value directly.
	 */
	private addRowActions(
		ctx: EditContext,
		setting: Setting,
		field: Field,
		unmetRequired = false
	): void {
		if (isInputSupported(field.type)) {
			const action = controlActionFor(field.type);
			const { icon, verb, alt } = controlLabel(action);
			// Same rule as the Properties buttons: a date with an interval sequence
			// advances on Alt-click, and shows the date it would write.
			const hasNextDate = !!nextDateActionFor(ctx, field);
			const tooltip = hasNextDate
				? `${verb} (Alt-click to set the next date)`
				: alt
					? `${verb} (Alt-click to pick a value)`
					: verb;
			setting.addExtraButton((b) => {
				b.setIcon(icon).setTooltip(unmetRequired ? `${tooltip} — required` : tooltip);
				b.extraSettingsEl.toggleClass("is-required-empty", unmetRequired);
				if (hasNextDate) {
					attachAltAffordance(b.extraSettingsEl, { icon, label: tooltip }, () => {
						const next = nextDateActionFor(ctx, field);
						return next
							? { icon: "skip-forward", label: `Set to ${next.next} (+${next.interval})` }
							: null;
					});
				}
				// Not `.onClick()`: it drops the event, and the modifier is the point.
				b.extraSettingsEl.addEventListener("click", (e) => {
					void runControlAction(ctx, field, { alt: e.altKey });
				});
			});
		}
		setting.addExtraButton((b) =>
			b
				.setIcon("x")
				.setTooltip("Clear")
				.onClick(() => void clearField(this.app, this.file, field))
		);
	}

	/** The field indicator for a linked note (fileClass fields), or null. */
	private linkIndicator(linktext: string): HTMLElement | null {
		const dest = this.app.metadataCache.getFirstLinkpathDest(linktext, this.file.path);
		if (!dest) return null;
		const target = navIndicatorFile(this.plugin, dest.path);
		return target ? makeIndicatorIcon(this.plugin, target, MODAL_SCOPE) : null;
	}

	/** Does the note's frontmatter disagree with the order its class declares? */
	private isOutOfOrder(fields: Field[]): boolean {
		if (!fields.length) return false;
		const keys = Object.keys(this.app.metadataCache.getFileCache(this.file)?.frontmatter ?? {});
		return reorderPlan(fields, keys, this.plugin.settings.unknownKeysPosition) !== null;
	}

	private async reorderProperties(fields: Field[]): Promise<void> {
		const { moved, unpositionable } = await reorderFrontmatter(
			this.app,
			this.file,
			fields,
			this.plugin.settings.unknownKeysPosition
		);
		if (!moved) return;
		const caveat = unpositionable.length
			? ` (${unpositionable.join(", ")} stays where YAML puts it)`
			: "";
		new Notice(`Fileclass: reordered ${moved} properties${caveat}.`);
		// The modal redraws on the metadata change this write causes; render now so the button
		// goes as soon as the work is done rather than a cache tick later.
		this.render();
	}
}
