/*
 * Per-type field-options settings UI (ARCHITECTURE.md §20.3, §7). Renders the
 * settings for a field type into a container, mutating the shared draft. This
 * slice covers Number, Date/DateTime/Time, and Select/Cycle/Multi (inline list
 * or note-path source). Base-view sources and File/Media/Object settings arrive
 * in P2-ter.3; unsupported list sources show a note and are left untouched.
 */
import { Setting } from "obsidian";

import { FieldType } from "../../schema/field";
import { OptionsDraft } from "../optionsDraft";

export function renderFieldOptionsSettings(
	container: HTMLElement,
	type: FieldType,
	draft: OptionsDraft
): void {
	container.empty();
	switch (type) {
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
				.addToggle((t) =>
					t.setValue(!!draft.defaultInsertAsLink).onChange((v) => (draft.defaultInsertAsLink = v))
				);
			return;
		case "Select":
		case "Cycle":
		case "Multi":
			renderListSettings(container, draft);
			return;
		default:
			return; // Input/Boolean: no options; File/Media/Object: later slice
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

function renderListSettings(container: HTMLElement, draft: OptionsDraft): void {
	container.empty();

	if (draft.sourceType === undefined) {
		container.createEl("p", {
			text:
				"This field's values come from a Base/query source. Editing that source is coming soon; other settings are preserved.",
			cls: "setting-item-description",
		});
		return;
	}

	new Setting(container).setName("Values source").addDropdown((d) => {
		d.addOption("ValuesList", "Inline list");
		d.addOption("ValuesListNotePath", "From a note");
		d.setValue(draft.sourceType ?? "ValuesList").onChange((v) => {
			draft.sourceType = v as "ValuesList" | "ValuesListNotePath";
			renderListSettings(container, draft);
		});
	});

	if (draft.sourceType === "ValuesListNotePath") {
		new Setting(container)
			.setName("Note path")
			.setDesc("Values are the note's non-empty lines.")
			.addText((t) =>
				t.setValue(draft.valuesListNotePath ?? "").onChange((v) => (draft.valuesListNotePath = v))
			);
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
