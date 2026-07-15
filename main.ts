/*
 * Fileclass — plugin entry point.
 *
 * Intentionally thin (ARCHITECTURE.md §4): it wires the global singleton (D7),
 * feature-detects the core Bases plugin through basesAdapter (D4), and owns the
 * long-lived queryCache. Everything else is delivered by later phases under
 * src/. No Bases/private-internal access happens here — only via the adapter.
 */
import { Notice, Plugin, TFile } from "obsidian";

import { setPlugin, clearPlugin } from "./src/globals";
import { isBasesAvailable } from "./src/engine/basesAdapter";
import { QueryCache } from "./src/engine/queryCache";

export default class FileclassPlugin extends Plugin {
	/**
	 * True when the core Bases plugin is enabled and the internals the adapter
	 * relies on are present. Query-dependent features degrade gracefully when
	 * this is false (ARCHITECTURE.md §6).
	 */
	basesAvailable = false;

	/** Long-lived cache of parsed .base queries, invalidated on vault modify. */
	queryCache!: QueryCache;

	async onload(): Promise<void> {
		setPlugin(this);

		this.queryCache = new QueryCache(this.app);
		// Evict a base's cached parse when its file changes on disk (§6).
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "base") {
					this.queryCache.invalidate(file.path);
				}
			})
		);
		this.register(() => this.queryCache.dispose());

		this.refreshBasesAvailability();
		// Bases is a core plugin; if it is toggled after we load, re-check on the
		// next layout-ready and inform the user rather than silently misbehaving.
		this.app.workspace.onLayoutReady(() => this.refreshBasesAvailability());
	}

	onunload(): void {
		clearPlugin();
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
