/*
 * Internal-link field indicator (ARCHITECTURE.md §19.4, P2-bis.3a). Injects the
 * clickable icon next to internal links pointing at fileClass-bound notes:
 *   - reading view — via a markdown post-processor (per rendered block);
 *   - backlinks and Bases panels — via MutationObservers on their leaves.
 * Live Preview (a CM6 editor extension) is a separate slice (3b).
 *
 * Same fragile-boundary discipline as FieldIndicator: per-surface flags, guarded
 * observers, full teardown on unload, and it never throws into the app.
 */
import { Component, TFile, debounce, getLinkpath } from "obsidian";
import { Prec } from "@codemirror/state";

import type FileclassPlugin from "../../../main";
import { INDEXED_EVENT } from "../../schema/fileclassIndex";
import { fileWithFields, LINK_SCOPE, makeIndicatorIcon, removeIndicators } from "./indicatorDom";
import { buildLivePreviewExtension } from "./livePreview";

interface ViewWithFile {
	file?: TFile;
}

export class LinkIndicator extends Component {
	private observers: MutationObserver[] = [];

	constructor(private readonly plugin: FileclassPlugin) {
		super();
	}

	onload(): void {
		// Reading view: decorate each rendered block's internal links.
		this.plugin.registerMarkdownPostProcessor((el, ctx) => {
			if (!this.plugin.settings.enableInlineLinkIndicator) return;
			this.guard(() => this.decorateLinks(el, ctx.sourcePath));
		});

		// Live Preview: a CodeMirror extension (gated on the same setting).
		this.plugin.registerEditorExtension(Prec.lowest(buildLivePreviewExtension(this.plugin)));

		const refresh = debounce(() => this.refreshAll(), 200, true);
		this.registerEvent(this.plugin.app.workspace.on("layout-change", refresh));
		this.registerEvent(this.plugin.index.on(INDEXED_EVENT, refresh));
		this.plugin.app.workspace.onLayoutReady(refresh);
	}

	onunload(): void {
		this.disconnectObservers();
		removeIndicators(LINK_SCOPE);
	}

	/** Re-injects immediately (e.g. after a settings toggle). */
	refreshNow(): void {
		this.refreshAll();
	}

	private guard(fn: () => void): void {
		try {
			fn();
		} catch {
			/* a drifted selector must never break the app */
		}
	}

	private disconnectObservers(): void {
		this.observers.forEach((o) => o.disconnect());
		this.observers = [];
	}

	/** Rebuilds panel observers and re-decorates currently-rendered surfaces. */
	private refreshAll(): void {
		this.disconnectObservers();
		removeIndicators(LINK_SCOPE);
		const s = this.plugin.settings;

		if (s.enableInlineLinkIndicator) {
			for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
				const source = (leaf.view as unknown as ViewWithFile).file?.path ?? "";
				this.guard(() => this.decorateLinks(leaf.view.containerEl, source));
			}
		}
		if (s.enableBacklinkIndicator) this.guard(() => this.watch("backlink"));
		if (s.enableBasesIndicator) this.guard(() => this.watch("bases"));
	}

	/** Observes a leaf type and decorates its internal links as they render. */
	private watch(viewType: string): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(viewType)) {
			const container = leaf.view.containerEl;
			const decorate = debounce(() => this.guard(() => this.decorateLinks(container, "")), 100, true);
			const observer = new MutationObserver(() => decorate());
			observer.observe(container, { subtree: true, childList: true });
			this.observers.push(observer);
			this.decorateLinks(container, ""); // initial pass
		}
	}

	private decorateLinks(root: HTMLElement, sourcePath: string): void {
		root.querySelectorAll<HTMLElement>("a.internal-link, .internal-link").forEach((link) =>
			this.decorate(link, sourcePath)
		);
	}

	private decorate(link: HTMLElement, sourcePath: string): void {
		// Skip if our icon already follows this link.
		if (link.nextElementSibling?.classList.contains(LINK_SCOPE)) return;
		const href =
			link.getAttribute("data-href") ?? link.getAttribute("href") ?? link.textContent ?? "";
		const linktext = getLinkpath(href.split("#")[0].trim());
		if (!linktext) return;
		const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
		const file = dest && fileWithFields(this.plugin, dest.path);
		if (!file) return;
		link.insertAdjacentElement("afterend", makeIndicatorIcon(this.plugin, file, LINK_SCOPE));
	}
}
