/*
 * Field indicator (ARCHITECTURE.md §19.4, P2-bis.2). A small clickable icon
 * injected next to a note's name — in the tab header, file explorer, and
 * bookmarks — that opens the note-fields modal. Icon-only by default.
 *
 * This is the fragile DOM-injection boundary: it is isolated here, every
 * surface is behind a settings flag, each pass is wrapped so a missed selector
 * no-ops rather than throwing, and all icons are removed on unload. Core
 * features (modal, menus, commands) never depend on it. Internals are reached
 * through minimal structural casts (no `any`, mirroring the adapter's style).
 */
import { Component, TFile, debounce } from "obsidian";

import type FileclassPlugin from "../../../main";
import { INDEXED_EVENT } from "../../schema/fileclassIndex";
import {
	fileWithFields,
	makeIndicatorIcon,
	NAV_SCOPE,
	removeIndicators,
} from "./indicatorDom";

/** Workspace-leaf internals we rely on (undocumented, feature-detected). */
interface LeafInternals {
	tabHeaderEl?: HTMLElement;
}
interface ViewWithFile {
	file?: TFile;
}

export class FieldIndicator extends Component {
	constructor(private readonly plugin: FileclassPlugin) {
		super();
	}

	onload(): void {
		const refresh = debounce(() => this.refresh(), 150, true);
		const ws = this.plugin.app.workspace;
		this.registerEvent(ws.on("layout-change", refresh));
		this.registerEvent(ws.on("active-leaf-change", refresh));
		this.registerEvent(ws.on("file-open", refresh));
		// Re-inject when bindings change (a file may gain/lose a fileClass).
		this.registerEvent(this.plugin.index.on(INDEXED_EVENT, refresh));
		ws.onLayoutReady(refresh);
	}

	onunload(): void {
		this.removeAll();
	}

	/** Re-injects immediately (e.g. after a settings toggle). */
	refreshNow(): void {
		this.refresh();
	}

	/** Returns the file if Fileclass applies to it (has resolved fields). */
	private applies(path: string | null): TFile | null {
		return fileWithFields(this.plugin, path);
	}

	private inject(target: HTMLElement, file: TFile): void {
		if (target.querySelector(`:scope > .${NAV_SCOPE}`)) return; // already present
		target.appendChild(makeIndicatorIcon(this.plugin, file, NAV_SCOPE));
	}

	private refresh(): void {
		// Rebuild from scratch — cheap, and avoids stale icons on files that no
		// longer apply. Each surface is independent and self-guarded.
		this.removeAll();
		const s = this.plugin.settings;
		if (s.enableFileExplorerIndicator) this.guard(() => this.injectByDataPath(".nav-file-title"));
		if (s.enableBookmarksIndicator) this.guard(() => this.injectBookmarks());
		if (s.enableTabHeaderIndicator) this.guard(() => this.injectTabs());
	}

	private guard(fn: () => void): void {
		try {
			fn();
		} catch {
			/* a drifted selector must never break the app */
		}
	}

	/** Nav-style rows (file explorer) carry the path on `data-path`. */
	private injectByDataPath(selector: string): void {
		document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
			const file = this.applies(el.getAttribute("data-path"));
			if (file) this.inject(el, file);
		});
	}

	private injectBookmarks(): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("bookmarks")) {
			leaf.view.containerEl
				.querySelectorAll<HTMLElement>(".tree-item-self[data-path]")
				.forEach((el) => {
					const file = this.applies(el.getAttribute("data-path"));
					if (file) this.inject(el, file);
				});
		}
	}

	private injectTabs(): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const file = (leaf.view as unknown as ViewWithFile).file;
			if (!file || !this.applies(file.path)) continue;
			const header = (leaf as unknown as LeafInternals).tabHeaderEl;
			if (!(header instanceof HTMLElement)) continue;
			const inner = header.querySelector<HTMLElement>(".workspace-tab-header-inner") ?? header;
			this.inject(inner, file);
		}
	}

	private removeAll(): void {
		removeIndicators(NAV_SCOPE);
	}
}
