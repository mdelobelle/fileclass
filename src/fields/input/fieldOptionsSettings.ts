/*
 * Per-type field-options settings UI (ARCHITECTURE.md §20.3, §7). Renders the
 * settings for a field type into a container, mutating the shared draft. This
 * slice covers Number, Date/DateTime/Time, and Select/Cycle/Multi (inline list
 * or note-path source). Base-view sources and File/Media/Object settings arrive
 * in P2-ter.3; unsupported list sources show a note and are left untouched.
 */
import { App, Setting } from "obsidian";

import { Field, FieldType } from "../../schema/field";
import { intervalFieldChoices, isIntervalField } from "../intervalChoices";
import {
	conditionalViewName,
	dependencyChoices,
	hasDependency,
	matchFormula,
} from "../conditional";
import {
	BaseColumnSuggest,
	BaseFileSuggest,
	BaseViewSuggest,
	NoteFileSuggest,
} from "../../ui/baseSuggest";
import { formatDuration } from "../duration";
import { OptionsDraft } from "../optionsDraft";
import { renderCanvasSettings } from "./canvasOptionsSettings";
import { DurationInputModal } from "./durationModal";
import { ICON_SOURCES } from "./iconPicker";
import { COLOR_SOURCES } from "./colorPicker";
import { DateFormatDefaults, defaultFormatFor, NO_DATE_DEFAULTS } from "../dateFormats";
import { buildDateLink } from "../dateLink";
import { attachFormatPreview, attachLinkPreview, formatNow } from "../../ui/dateFormatPreview";
import { chainRowInput, returnFocusTo } from "../../ui/listKeyboard";

export interface FieldOptionsCtx {
	app: App;
	/** The field being edited — excluded from the fields it may depend on. */
	fieldName?: string;
	/** Plugin-wide write formats, to name the fallback under "Date format". */
	dateDefaults?: DateFormatDefaults;
	/**
	 * The fileClass's resolved fields (own and inherited), so "Next interval
	 * field" can offer the compatible ones instead of asking for a name.
	 */
	classFields?: readonly Pick<Field, "name" | "type">[];
}

/** What "blank" stores when no default is set either. */
const NATIVE_DATE_FORMATS: Partial<Record<FieldType, string>> = {
	Date: "YYYY-MM-DD",
	DateTime: "YYYY-MM-DD[T]HH:mm",
	Time: "HH:mm",
};

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
					"Optional — a shape for each value, not a list of allowed values. To limit a field " +
						"to values you choose, use Select or Multi instead. In a template, {{name}} is a " +
						'free-text part and {{name:["a","b"]}} a dropdown over that JSON array. When set, ' +
						"entry shows one control per placeholder plus a live preview; each stored value " +
						"stays a " +
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
			new Setting(container)
				.setName("Multi-line")
				.setDesc(
					"Enter the value in a text area rather than a one-line prompt — for a summary, an " +
						"abstract, a rationale. The value is unchanged: one string, line breaks included, " +
						"validated as " +
						(type === "MultiInput" ? "each list item is." : "any other Input.") +
						" A template wins over this, since a template is a shape made of single-line parts."
				)
				.addToggle((t) => t.setValue(draft.multiline === true).onChange((v) => (draft.multiline = v)));
			return;
		case "Duration":
		case "CycleDuration":
			renderDurationPresets(container, draft, ctx.app);
			return;
		case "Icon":
			new Setting(container)
				.setName("Icon source")
				.setDesc("Which icon bank the picker offers.")
				.addDropdown((d) => {
					for (const s of ICON_SOURCES) d.addOption(s.id, s.label);
					d.setValue(draft.iconSource ?? "lucide").onChange((v) => (draft.iconSource = v));
				});
			return;
		case "Color":
			new Setting(container)
				.setName("Color source")
				.setDesc("Which palette the picker offers (custom colors are always allowed).")
				.addDropdown((d) => {
					for (const s of COLOR_SOURCES) d.addOption(s.id, s.label);
					d.setValue(draft.colorSource ?? "canvas").onChange((v) => (draft.colorSource = v));
				});
			return;
		case "Number":
			numberField(container, "Min", draft, "min");
			numberField(container, "Max", draft, "max");
			numberField(container, "Step", draft, "step");
			return;
		case "Date":
		case "DateTime":
		case "Time": {
			// The link preview depends on the format field too, so both refresh it.
			let refreshLink: (() => void) | undefined;
			{
				// Name the default this type falls back to, so "blank" is a decision
				// made with the value in front of you — and show what it writes today.
				const fallback =
					defaultFormatFor(type, ctx.dateDefaults ?? NO_DATE_DEFAULTS) ||
					NATIVE_DATE_FORMATS[type] ||
					"";
				const setting = new Setting(container)
					.setName("Date format")
					.setDesc(`momentjs format. Blank uses default: ${fallback}`);
				const refreshFormat = attachFormatPreview(setting, () => fallback);
				setting.addText((t) =>
					t
						.setPlaceholder(fallback)
						.setValue(draft.dateFormat ?? "")
						.onChange((v) => {
							draft.dateFormat = v;
							refreshFormat(v);
							refreshLink?.();
						})
				);
				refreshFormat(draft.dateFormat ?? "");
			}
			new Setting(container)
				.setName("Insert as link")
				.setDesc("Store the date as a [[wikilink]] instead of raw text.")
				.addToggle((t) =>
					t.setValue(!!draft.defaultInsertAsLink).onChange((v) => (draft.defaultInsertAsLink = v))
				);
			{
				const linkSetting = new Setting(container)
					.setName("Link path")
					.setDesc(
						"Optional folder for the date link, e.g. Journal/. Braced tokens follow the " +
							"date: Daily/Notes/{{YYYY}}/{{MM}}/ files each link under its year and month."
					);
				// The link is the one value where path, format and alias combine, so
				// preview the whole thing rather than each part.
				refreshLink = attachLinkPreview(linkSetting, (today) => {
					const fmt =
						(draft.dateFormat ?? "").trim() ||
						defaultFormatFor(type, ctx.dateDefaults ?? NO_DATE_DEFAULTS) ||
						NATIVE_DATE_FORMATS[type] ||
						"YYYY-MM-DD";
					return buildDateLink(
						formatNow(fmt) || today,
						today,
						{ linkPath: draft.dateLinkPath ?? "", alias: !!draft.dateLinkAlias },
						(_iso, token) => formatNow(token)
					);
				});
				linkSetting.addText((t) =>
					t
						.setPlaceholder("(vault root)")
						.setValue(draft.dateLinkPath ?? "")
						.onChange((v) => {
							draft.dateLinkPath = v;
							refreshLink?.();
						})
				);
				new Setting(container)
					.setName("Link alias")
					.setDesc("Write [[path/date|date]], so the link reads as the date instead of its path.")
					.addToggle((t) =>
						t.setValue(!!draft.dateLinkAlias).onChange((v) => {
							draft.dateLinkAlias = v;
							refreshLink?.();
						})
					);
				refreshLink();
			}
			if (type !== "Time") {
				const classFields = ctx.classFields ?? [];
				const choices = intervalFieldChoices(classFields, draft.nextIntervalField);
				const none = !classFields.some((f) => isIntervalField(f));
				new Setting(container)
					.setName("Next interval field")
					.setDesc(
						'Optional. Adds a "Set next date" button that advances this date by the ' +
							"interval held in another field (and cycles a CycleDuration list to its " +
							"next value). " +
							(none
								? "This fileClass has no Duration or CycleDuration field yet — add one, then come back."
								: "Only Duration and CycleDuration fields can drive it.")
					)
					.addDropdown((d) => {
						for (const c of choices) d.addOption(c.value, c.label);
						// A stored name the dropdown had to keep (see intervalChoices)
						// stays selected; setValue on an absent option would blank it.
						d.setValue(draft.nextIntervalField ?? "").onChange(
							(v) => (draft.nextIntervalField = v)
						);
					});
			}
			return;
		}
		case "Select":
		case "Cycle":
		case "Multi":
			renderListSettings(container, draft, ctx);
			return;
		case "File":
		case "MultiFile":
		case "Media":
		case "MultiMedia":
			renderLinkSettings(container, draft, ctx);
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

	renderDependency(container, draft, ctx);
}

/**
 * "Depends on another field" (#19): the author picks the source field and the
 * property to match, and Fileclass writes the formula and the view into the bound
 * base on save. The preview is the point — the generated predicate is visible
 * before saving, instead of being discovered later inside the `.base`.
 */
function renderDependency(
	container: HTMLElement,
	draft: OptionsDraft,
	ctx: FieldOptionsCtx
): void {
	const classFields = ctx.classFields ?? [];
	const self = ctx.fieldName ?? "";
	const choices = dependencyChoices(classFields, self, draft.dependsOn);
	const eligible = choices.filter((c) => c.value && !c.label.endsWith("(not found)"));

	let refresh = (): void => undefined;

	new Setting(container)
		.setName("Depends on another field")
		.setDesc(
			eligible.length
				? "Optional. Narrows the candidates to those matching this note's value for that field."
				: "Optional. This fileClass has no other single-valued field to depend on yet."
		)
		.addDropdown((d) => {
			for (const c of choices) d.addOption(c.value, c.label);
			d.setValue(draft.dependsOn ?? "").onChange((v) => {
				draft.dependsOn = v;
				// The candidate side is usually named like the source field.
				if (v && !draft.matchProperty?.trim()) draft.matchProperty = v;
				refresh();
			});
		});

	const matchSetting = new Setting(container)
		.setName("Match on property")
		.setDesc("Property on the candidate side, compared against that value.");
	matchSetting.addText((t) => {
		t.setPlaceholder("(same name)")
			.setValue(draft.matchProperty ?? "")
			.onChange((v) => {
				draft.matchProperty = v;
				refresh();
			});
		new BaseColumnSuggest(
			ctx.app,
			t.inputEl,
			() => draft.baseFile ?? "",
			() => draft.viewName ?? ""
		);
	});

	// What will be written, in the base's own language.
	const previewEl = container.createDiv({ cls: "fileclass-format-preview" });
	refresh = () => {
		const source = draft.dependsOn?.trim();
		const match = draft.matchProperty?.trim();
		matchSetting.settingEl.toggleClass("fileclass-setting-off", !source);
		previewEl.empty();
		if (!hasDependency(source, match)) return;
		const sourceType =
			classFields.find((f) => f.name === source)?.type ?? ("Input" as FieldType);
		const spec = { source: source as string, sourceType, match: match as string };
		previewEl.createSpan({ cls: "fileclass-format-sample", text: conditionalViewName(spec) });
		previewEl.createEl("code", { cls: "fileclass-formula", text: matchFormula(spec) });
	};
	refresh();
}

function renderDurationPresets(container: HTMLElement, draft: OptionsDraft, app: App): void {
	if (!draft.durationPresets) draft.durationPresets = [];
	const presets = draft.durationPresets;

	const listEl = container.createDiv({ cls: "fileclass-setting-list" });
	const rebuild = () => {
		listEl.empty();
		presets.forEach((p, i) => {
			new Setting(listEl)
				.setName(formatDuration(p) || p)
				.addExtraButton((b) =>
					b
						.setIcon("pencil")
						.setTooltip("Edit")
						.onClick(() =>
							new DurationInputModal(app, {
								title: "Preset duration",
								initial: p,
								onSubmit: (v) => {
									if (v) presets[i] = v;
									else presets.splice(i, 1);
									rebuild();
								},
							}).open()
						)
				)
				.addExtraButton((b) =>
					b
						.setIcon("trash")
						.setTooltip("Remove")
						.onClick(() => {
							presets.splice(i, 1);
							rebuild();
						})
				);
		});
	};

	// Header row carries the "Add preset" action (right-aligned), list renders below it.
	const header = new Setting(container)
		.setName("Preset durations")
		.setDesc("Optional. Offered as quick picks when entering a value on a note.")
		.addButton((b) =>
			b.setButtonText("Add preset").onClick(() =>
				new DurationInputModal(app, {
					title: "Preset duration",
					initial: "",
					onSubmit: (v) => {
						if (v) {
							presets.push(v);
							rebuild();
						}
						returnFocusTo(b.buttonEl);
					},
				}).open()
			)
		);
	// Keep the list directly under the header.
	header.settingEl.insertAdjacentElement("afterend", listEl);
	rebuild();
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

	// Only a field that really carries a Dataview query says so. Testing "no source yet" instead
	// warned on every field switched to `Select` from another type, the draft being shared.
	if (draft.legacyDvSource) {
		container.createEl("p", {
			text:
				"This field's values come from a legacy Dataview source. Switch it to an inline list, a note, or a Base view below.",
			cls: "setting-item-description",
		});
	}
	// A list type always needs a source; an inline list is the one that needs no setting up.
	draft.sourceType ??= "ValuesList";

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

	const listEl = container.createDiv({ cls: "fileclass-setting-list" });
	// Resolved on Enter, not here: the button renders below the rows.
	let addButton: HTMLElement | undefined;
	/** `focusIndex` is the row just added — its input takes the caret. */
	const rebuild = (focusIndex = -1) => {
		listEl.empty();
		values.forEach((val, i) => {
			new Setting(listEl)
				.addText((t) => {
					t.setValue(val).onChange((v) => (values[i] = v));
					chainRowInput(t.inputEl, () => addButton, i === focusIndex);
				})
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

	new Setting(container).setClass("fileclass-list-add").addButton((b) => {
		addButton = b.buttonEl;
		b.setButtonText("Add value").onClick(() => {
			values.push("");
			rebuild(values.length - 1);
		});
	});
}
