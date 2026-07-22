/*
 * Per-type field-options settings UI (ARCHITECTURE.md §20.3, §7). Renders the
 * settings for a field type into a container, mutating the shared draft. This
 * slice covers Number, Date/DateTime/Time, and Select/Cycle/Multi (inline list
 * or note-path source). Base-view sources and File/Media/Object settings arrive
 * in P2-ter.3; unsupported list sources show a note and are left untouched.
 */
import { App, Setting } from "obsidian";

import { FieldType } from "../../schema/field";
import {
	BaseColumnSuggest,
	BaseFileSuggest,
	BaseViewSuggest,
	NoteFileSuggest,
} from "../../ui/baseSuggest";
import { OptionsDraft } from "../optionsDraft";
import { renderCanvasSettings } from "./canvasOptionsSettings";

export interface FieldOptionsCtx {
	app: App;
}

export function renderFieldOptionsSettings(
	container: HTMLElement,
	type: FieldType,
	draft: OptionsDraft,
	ctx: FieldOptionsCtx
): void {
	container.empty();
	switch (type) {
		case "Input":
		case "MultiInput":
			new Setting(container)
				.setName("Template")
				.setDesc(
					'Optional. Compose each value from fixed parts. {{name}} is a text sub-input; ' +
						'{{name:["a","b"]}} is a dropdown over the JSON array of choices. When set, entry ' +
						"shows one control per placeholder plus a live preview; each stored value stays a " +
						(type === "MultiInput" ? "single string (one per list item)." : "single string.")
				)
				// Stack the textarea full-width under the label (it's cramped in the
				// narrow control column otherwise); see styles.css.
				.setClass("fileclass-template-setting")
				.addTextArea((t) => {
					t.setPlaceholder("https://github.com/{{user}}/{{repo}}/")
						.setValue(draft.template ?? "")
						.onChange((v) => (draft.template = v));
					t.inputEl.rows = 4;
					t.inputEl.addClass("fileclass-template-input");
				});
			return;
		case "Number":
			numberField(container, "Min", draft, "min");
			numberField(container, "Max", draft, "max");
			numberField(container, "Step", draft, "step");
			return;
		case "Date":
		case "DateTime":
		case "Time":
			new Setting(container)
				.setName("Date format")
				.setDesc("moment.js format; blank uses the default.")
				.addText((t) => t.setValue(draft.dateFormat ?? "").onChange((v) => (draft.dateFormat = v)));
			new Setting(container)
				.setName("Insert as link")
				.setDesc("Store the date as a [[wikilink]] instead of raw text.")
				.addToggle((t) =>
					t.setValue(!!draft.defaultInsertAsLink).onChange((v) => (draft.defaultInsertAsLink = v))
				);
			new Setting(container)
				.setName("Link path")
				.setDesc("Optional folder prefix for the date link, e.g. Journal/.")
				.addText((t) =>
					t
						.setPlaceholder("(vault root)")
						.setValue(draft.dateLinkPath ?? "")
						.onChange((v) => (draft.dateLinkPath = v))
				);
			if (type !== "Time") {
				new Setting(container)
					.setName("Next interval field")
					.setDesc(
						"Optional. Name of a Duration or MultiDuration field in this fileClass. Adds a " +
							'"Set next date" button that advances this date by that interval (and cycles ' +
							"a MultiDuration list to its next value)."
					)
					.addText((t) =>
						t
							.setPlaceholder("(none)")
							.setValue(draft.nextIntervalField ?? "")
							.onChange((v) => (draft.nextIntervalField = v))
					);
			}
			return;
		case "Select":
		case "Cycle":
		case "Multi":
			renderListSettings(container, draft, ctx);
			return;
		case "File":
		case "MultiFile":
		case "Media":
		case "MultiMedia":
			renderLinkSettings(container, type, draft, ctx);
			return;
		case "Canvas":
		case "CanvasGroup":
		case "CanvasGroupLink":
			renderCanvasSettings(container, type, draft, ctx.app);
			return;
		case "Object":
		case "ObjectList":
			new Setting(container)
				.setName("Display template")
				.setDesc(
					"How an item is summarized. Use {{fieldName}} placeholders, e.g. {{designation}} - {{ville}}. A date field takes an optional moment.js format: {{start|DD/MM/YYYY}}. Blank shows the first non-empty field." +
						(type === "ObjectList" ? " Each item is prefixed by its rank." : "")
				)
				.addText((t) =>
					t
						.setPlaceholder("{{firstField}}")
						.setValue(draft.displayTemplate ?? "")
						.onChange((v) => (draft.displayTemplate = v))
				);
			return;
		default:
			return; // Input/Boolean: no options
	}
}

function renderLinkSettings(
	container: HTMLElement,
	type: FieldType,
	draft: OptionsDraft,
	ctx: FieldOptionsCtx
): void {
	new Setting(container)
		.setName("Base file")
		.setDesc("A .base file whose view provides the candidates.")
		.addText((t) => {
			t.setValue(draft.baseFile ?? "").onChange((v) => (draft.baseFile = v));
			new BaseFileSuggest(ctx.app, t.inputEl);
		});

	new Setting(container)
		.setName("View")
		.setDesc("View within the base (blank = first).")
		.addText((t) => {
			t.setValue(draft.viewName ?? "").onChange((v) => (draft.viewName = v));
			new BaseViewSuggest(ctx.app, t.inputEl, () => draft.baseFile ?? "");
		});

	new Setting(container)
		.setName("Display column")
		.setDesc("Base column id shown as the alias, e.g. note.title (optional).")
		.addText((t) =>
			t.setValue(draft.displayColumn ?? "").onChange((v) => (draft.displayColumn = v))
		);

	if (type === "Media" || type === "MultiMedia") {
		new Setting(container)
			.setName("Embed")
			.setDesc("Store the value as an embed (![[…]]).")
			.addToggle((t) => t.setValue(!!draft.embed).onChange((v) => (draft.embed = v)));
	}
}

function numberField(
	c: HTMLElement,
	name: string,
	draft: OptionsDraft,
	key: "min" | "max" | "step"
): void {
	new Setting(c).setName(name).addText((t) =>
		t.setValue(draft[key] ?? "").onChange((v) => (draft[key] = v))
	);
}

function renderListSettings(
	container: HTMLElement,
	draft: OptionsDraft,
	ctx: FieldOptionsCtx
): void {
	container.empty();

	if (draft.sourceType === undefined) {
		container.createEl("p", {
			text:
				"This field's values come from a legacy Dataview source. Switch it to an inline list, a note, or a Base view below.",
			cls: "setting-item-description",
		});
		// Offer a source picker so the legacy source can be replaced.
		draft.sourceType = "ValuesList";
	}

	new Setting(container).setName("Values source").addDropdown((d) => {
		d.addOption("ValuesList", "Inline list");
		d.addOption("ValuesListNotePath", "From a note");
		d.addOption("ValuesFromBase", "From a Base view");
		d.setValue(draft.sourceType ?? "ValuesList").onChange((v) => {
			draft.sourceType = v as OptionsDraft["sourceType"];
			renderListSettings(container, draft, ctx);
		});
	});

	if (draft.sourceType === "ValuesListNotePath") {
		new Setting(container)
			.setName("Note path")
			.setDesc("Values are the note's non-empty lines.")
			.addText((t) => {
				t.setValue(draft.valuesListNotePath ?? "").onChange(
					(v) => (draft.valuesListNotePath = v)
				);
				new NoteFileSuggest(ctx.app, t.inputEl);
			});
		return;
	}

	if (draft.sourceType === "ValuesFromBase") {
		new Setting(container)
			.setName("Base file")
			.setDesc("A .base whose view provides the values.")
			.addText((t) => {
				t.setValue(draft.baseFile ?? "").onChange((v) => (draft.baseFile = v));
				new BaseFileSuggest(ctx.app, t.inputEl);
			});
		new Setting(container)
			.setName("View")
			.setDesc("View within the base (blank = first).")
			.addText((t) => {
				t.setValue(draft.viewName ?? "").onChange((v) => (draft.viewName = v));
				new BaseViewSuggest(ctx.app, t.inputEl, () => draft.baseFile ?? "");
			});
		new Setting(container)
			.setName("Column")
			.setDesc("Column whose values become the list. Blank = the files' names.")
			.addText((t) => {
				t.setPlaceholder("(file name)")
					.setValue(draft.valuesColumn ?? "")
					.onChange((v) => (draft.valuesColumn = v));
				new BaseColumnSuggest(
					ctx.app,
					t.inputEl,
					() => draft.baseFile ?? "",
					() => draft.viewName ?? ""
				);
			});
		return;
	}

	renderInlineValues(container, draft);
}

function renderInlineValues(container: HTMLElement, draft: OptionsDraft): void {
	if (!draft.values) draft.values = [];
	const values = draft.values;

	const listEl = container.createDiv();
	const rebuild = () => {
		listEl.empty();
		values.forEach((val, i) => {
			new Setting(listEl)
				.addText((t) => t.setValue(val).onChange((v) => (values[i] = v)))
				.addExtraButton((b) =>
					b
						.setIcon("trash")
						.setTooltip("Remove")
						.onClick(() => {
							values.splice(i, 1);
							rebuild();
						})
				);
		});
	};
	rebuild();

	new Setting(container).addButton((b) =>
		b.setButtonText("Add value").onClick(() => {
			values.push("");
			rebuild();
		})
	);
}
