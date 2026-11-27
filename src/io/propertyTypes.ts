/*
 * Telling Obsidian what a property is (#207) — private-surface territory, in the spirit of D4.
 *
 * `app.metadataTypeManager` is where Obsidian keeps property types; `setType` writes
 * `.obsidian/types.json` and the Properties panel follows immediately. It is not in the published
 * API, so it is reached here, structurally typed, feature-detected, and never allowed to throw:
 * a note being written must not fail because a private surface moved.
 *
 * **A reader's own choice is never overwritten.** Only a property with no assigned type gets one —
 * someone who deliberately made `signed` a text property keeps it.
 */
import { App } from "obsidian";

import { Field } from "../schema/field";
import { widgetForFieldType } from "../fields/propertyWidget";

interface TypeManager {
	/** Types the reader (or a plugin) assigned, by property name. */
	assignedWidgets?: Record<string, unknown>;
	setType?(property: string, widget: string): void;
}

interface AppWithTypes {
	metadataTypeManager?: TypeManager;
}

/**
 * Assigns the Obsidian property type of each field that has an obvious one.
 *
 * Called where the plugin writes a field into a note: that is the moment the property starts
 * existing for Obsidian, and the moment its type would otherwise be inferred from a placeholder.
 */
export function assignPropertyTypes(app: App, fields: readonly Field[]): void {
	const manager = (app as unknown as AppWithTypes).metadataTypeManager;
	if (!manager || typeof manager.setType !== "function") return;
	for (const field of fields) {
		const widget = widgetForFieldType(field.type);
		if (!widget) continue;
		try {
			if (manager.assignedWidgets?.[field.name]) continue; // the reader has spoken
			manager.setType(field.name, widget);
		} catch {
			/* a property type is a nicety; the note matters more */
		}
	}
}
