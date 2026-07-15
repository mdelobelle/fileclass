/*
 * Fileclass — plugin entry point.
 *
 * Intentionally thin (ARCHITECTURE.md §4): it wires the global singleton (D7),
 * feature-detects the core Bases plugin through basesAdapter (D4), owns the
 * long-lived queryCache and the schema index, and registers commands/settings.
 * Feature logic lives under src/. No Bases/private-internal access happens
 * here — only via the adapter.
 */
import { Notice, Plugin, TAbstractFile, TFile, debounce } from "obsidian";

import { setPlugin, clearPlugin } from "./src/globals";
import { isBasesAvailable } from "./src/engine/basesAdapter";
import { QueryCache } from "./src/engine/queryCache";
import { insertMissingFields } from "./src/commands/insertMissingFields";
import { recalcLookupsForFile } from "./src/computed/lookupRecalc";
import { pickAndUpdateField } from "./src/fields/fieldActions";
import { FileclassIndex } from "./src/schema/fileclassIndex";
import {
	coerceSettings,
	FileclassSettings,
} from "./src/settings/settings";
import { FileclassSettingTab } from "./src/settings/settingsTab";
import { AddFileClassModal } from "./src/ui/addFileClassModal";
import { FileclassContextMenu } from "./src/ui/contextMenu";
import { openFileClassSchema } from "./src/ui/fileClassSchemaModal";
import { FieldIndicator } from "./src/ui/indicator/fieldIndicator";
import { LinkIndicator } from "./src/ui/indicator/linkIndicator";
import { NoteFieldsModal } from "./src/ui/noteFieldsModal";

export default class FileclassPlugin extends Plugin {
	// Narrows the base `Plugin.settings?: unknown` (declare = no re-emit).
	declare settings: FileclassSettings;

	/** Schema registry + file→fileClass binding (ARCHITECTURE.md §10). */
	index!: FileclassIndex;

	/** In-UI field indicator (tab header, file explorer, bookmarks — §19.4). */
	indicator!: FieldIndicator;

	/** Field indicator on internal links (reading view, backlinks, Bases — §19.4). */
	linkIndicator!: LinkIndicator;

	/** Long-lived cache of parsed .base queries, invalidated on vault modify. */
	queryCache!: QueryCache;

	/**
	 * True when the core Bases plugin is enabled and the internals the adapter
	 * relies on are present. Query-dependent features degrade gracefully when
	 * this is false (ARCHITECTURE.md §6).
	 */
	basesAvailable = false;

	async onload(): Promise<void> {
		setPlugin(this);
		await this.loadSettings();

		this.queryCache = new QueryCache(this.app);
		this.register(() => this.queryCache.dispose());

		this.index = new FileclassIndex(this);

		this.addSettingTab(new FileclassSettingTab(this.app, this));
		this.addChild(new FileclassContextMenu(this));
		this.indicator = this.addChild(new FieldIndicator(this));
		this.linkIndicator = this.addChild(new LinkIndicator(this));
		this.registerCommands();
		this.registerVaultListeners();

		// Defer the first scan and Bases detection until layout is ready — no
		// heavy work during onload (Obsidian performance guideline).
		this.app.workspace.onLayoutReady(() => {
			this.refreshBasesAvailability();
			this.index.rebuild();
		});
	}

	onunload(): void {
		clearPlugin();
	}

	// -- settings -------------------------------------------------------------

	async loadSettings(): Promise<void> {
		this.settings = coerceSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// -- wiring ---------------------------------------------------------------

	private registerCommands(): void {
		this.addCommand({
			id: "add-fileclass-to-current-file",
			name: "Add fileClass to current file",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) new AddFileClassModal(this, file).open();
				return true;
			},
		});

		this.addCommand({
			id: "manage-note-fields",
			name: "Manage note fields",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) new NoteFieldsModal(this, file).open();
				return true;
			},
		});

		this.addCommand({
			id: "update-field-in-current-file",
			name: "Update a field in current file",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) pickAndUpdateField(this, file, this.index.getFields(file));
				return true;
			},
		});

		this.addCommand({
			id: "insert-missing-fields-in-current-file",
			name: "Insert missing fields in current file",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void insertMissingFields(this.app, file, this.index.getFields(file));
				return true;
			},
		});

		this.addCommand({
			id: "recalculate-lookups-in-current-file",
			name: "Recalculate lookups in current file",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) {
					void recalcLookupsForFile(this, file).then((n) =>
						new Notice(
							n
								? `Fileclass: recalculated ${n} lookup${n > 1 ? "s" : ""}.`
								: "Fileclass: no lookups to recalculate."
						)
					);
				}
				return true;
			},
		});

		this.addCommand({
			id: "edit-fileclass-schema",
			name: "Edit a fileClass schema",
			checkCallback: (checking) => {
				if (!this.index.fileClassNames.length) return false;
				if (!checking) {
					const active = this.app.workspace.getActiveFile();
					const name = active ? this.index.fileClassNameOfNote(active.path) : undefined;
					openFileClassSchema(this, name);
				}
				return true;
			},
		});
	}

	private registerVaultListeners(): void {
		// Rebuild is idempotent and cheap; debounce bursts of events.
		const scheduleRebuild = debounce(() => this.index.rebuild(), 400, true);

		// Full metadata settle (initial load and after edits).
		this.registerEvent(this.app.metadataCache.on("resolved", scheduleRebuild));

		// Any change to a fileClass note (or a .base) invalidates derived state.
		const onChange = (file: TAbstractFile) => {
			if (!(file instanceof TFile)) return;
			if (file.extension === "base") this.queryCache.invalidate(file.path);
			if (this.affectsSchema(file.path)) scheduleRebuild();
		};
		this.registerEvent(this.app.vault.on("create", onChange));
		this.registerEvent(this.app.vault.on("modify", onChange));
		this.registerEvent(this.app.vault.on("delete", onChange));
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (this.affectsSchema(oldPath)) scheduleRebuild();
				onChange(file);
			})
		);
	}

	/** True when a path is (or was) a fileClass note under the class folder. */
	private affectsSchema(path: string): boolean {
		const folder = this.settings.classFilesPath;
		return !!folder && path.startsWith(folder) && path.endsWith(".md");
	}

	/** Re-runs adapter feature detection and surfaces a one-time warning. */
	private refreshBasesAvailability(): void {
		const available = isBasesAvailable(this.app);
		if (available === this.basesAvailable) return;
		this.basesAvailable = available;
		if (!available) {
			new Notice(
				"Fileclass: the core Bases plugin is disabled or incompatible. " +
					"Schema and typed input still work; query-dependent features " +
					"(File/Lookup/Formula fields, generated views) are disabled.",
				10000
			);
		}
	}
}
