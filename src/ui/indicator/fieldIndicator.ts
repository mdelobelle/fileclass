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
	makeIndicatorIcon,
	NAV_SCOPE,
	navIndicatorFile,
	removeIndicators,
} from "./indicatorDom";

/** Workspace-leaf internals we rely on (undocumented, feature-detected). */
interface LeafInternals {
	tabHeaderEl?: HTMLElement;
}
interface ViewWithFile {
	file?: TFile;
}
/** Bookmarks internals: file items carry a path; the view maps item → DOM. */
interface BookmarkItem {
	type?: string;
	path?: string;
	items?: BookmarkItem[];
}
interface BookmarksView {
	itemDoms?: WeakMap<BookmarkItem, { selfEl?: HTMLElement }>;
}
interface BookmarksInstance {
	items?: BookmarkItem[];
}

export class FieldIndicator extends Component {
	/** Observers on the nav panes (file explorer, bookmarks), which render rows
	 * lazily on expand/scroll without firing a workspace event. */
	private watched: { observer: MutationObserver; container: HTMLElement }[] = [];
	private scheduleInject: () => void = () => undefined;

	constructor(private readonly plugin: FileclassPlugin) {
		super();
	}

	onload(): void {
		this.scheduleInject = debounce(() => this.injectAll(), 100, true);
		const ws = this.plugin.app.workspace;
		// Panes can open/close on layout change — (re)attach observers then inject.
		this.registerEvent(ws.on("layout-change", () => this.reattachAndInject()));
		this.registerEvent(ws.on("active-leaf-change", this.scheduleInject));
		this.registerEvent(ws.on("file-open", this.scheduleInject));
		// A file may gain/lose a fileClass — full refresh drops now-stale icons.
		this.registerEvent(this.plugin.index.on(INDEXED_EVENT, () => this.fullRefresh()));
		ws.onLayoutReady(() => this.reattachAndInject());
	}

	onunload(): void {
		this.detachObservers();
		this.removeAll();
	}

	/** Re-injects immediately (e.g. after a settings toggle). */
	refreshNow(): void {
		this.fullRefresh();
	}

	private reattachAndInject(): void {
		this.reattachObservers();
		this.injectAll();
	}

	private reattachObservers(): void {
		this.detachObservers();
		for (const type of ["file-explorer", "bookmarks"]) {
			for (const leaf of this.plugin.app.workspace.getLeavesOfType(type)) {
				const container = leaf.view.containerEl;
				const observer = new MutationObserver(() => this.scheduleInject());
				observer.observe(container, { subtree: true, childList: true });
				this.watched.push({ observer, container });
			}
		}
	}

	private detachObservers(): void {
		this.watched.forEach((w) => w.observer.disconnect());
		this.watched = [];
	}

	/** File eligible for a nav indicator: fileClass note or fields-bound note. */
	private applies(path: string | null): TFile | null {
		return navIndicatorFile(this.plugin, path);
	}

	private inject(target: HTMLElement, file: TFile): void {
		const existing = target.querySelector<HTMLElement>(`:scope > .${NAV_SCOPE}`);
		if (existing) {
			if (existing.dataset.fcPath === file.path) return; // up-to-date icon present
			existing.remove(); // stale: this target now shows a different file
		}
		target.appendChild(makeIndicatorIcon(this.plugin, file, NAV_SCOPE));
	}

	/** Removes a scope's icon under `target`, if any (target no longer applies). */
	private clearIndicator(target: HTMLElement): void {
		target.querySelector(`:scope > .${NAV_SCOPE}`)?.remove();
	}

	/** Additive injection (dedup-guarded); safe to run on every mutation. */
	private injectAll(): void {
		const s = this.plugin.settings;
		if (s.enableFileExplorerIndicator) this.guard(() => this.injectByDataPath(".nav-file-title"));
		if (s.enableBookmarksIndicator) this.guard(() => this.injectBookmarks());
		if (s.enableTabHeaderIndicator) this.guard(() => this.injectTabs());
	}

	/** Clears every icon then re-injects (for stale removal on binding change). */
	private fullRefresh(): void {
		this.removeAll();
		this.injectAll();
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
		// Bookmark rows carry no data-path; resolve through the plugin's own
		// item tree and the view's item→DOM map (WeakMap) instead.
		const internal = this.plugin.app as unknown as {
			internalPlugins?: {
				getPluginById(id: string): { instance?: BookmarksInstance } | null;
			};
		};
		const items = internal.internalPlugins?.getPluginById("bookmarks")?.instance?.items;
		if (!items) return;

		for (const leaf of this.plugin.app.workspace.getLeavesOfType("bookmarks")) {
			const itemDoms = (leaf.view as unknown as BookmarksView).itemDoms;
			if (!itemDoms) continue;
			const walk = (list: BookmarkItem[]) => {
				for (const item of list) {
					if (item.type === "file" && item.path) {
						const file = this.applies(item.path);
						const el = itemDoms.get(item)?.selfEl;
						if (file && el) this.inject(el, file);
					}
					if (item.items) walk(item.items);
				}
			};
			walk(items);
		}
	}

	private injectTabs(): void {
		// A tab keeps its header element across file changes, so reconcile each
		// leaf: inject/replace when the current file applies, clear otherwise —
		// additive injection alone would leave the previous file's icon behind.
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			const header = (leaf as unknown as LeafInternals).tabHeaderEl;
			if (!(header instanceof HTMLElement)) continue;
			const inner = header.querySelector<HTMLElement>(".workspace-tab-header-inner") ?? header;
			const file = (leaf.view as unknown as ViewWithFile).file;
			const applicable = file && this.applies(file.path) ? file : null;
			if (applicable) this.inject(inner, applicable);
			else this.clearIndicator(inner);
		}
	}

	private removeAll(): void {
		removeIndicators(NAV_SCOPE);
	}
}
