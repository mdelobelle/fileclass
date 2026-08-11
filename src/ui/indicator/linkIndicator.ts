/*
 * Internal-link field indicator (ARCHITECTURE.md §19.4, P2-bis.3a). Injects the
 * clickable icon next to internal links pointing at fileClass-bound notes:
 *   - reading view — via a markdown post-processor (per rendered block);
 *   - Bases panels — via MutationObservers on their leaves;
 *   - the backlinks pane — same observer, different DOM: its results are tree items, not
 *     links, which is why it needs a decorator of its own.
 * Live Preview (a CM6 editor extension) is a separate slice (3b).
 *
 * Same fragile-boundary discipline as FieldIndicator: per-surface flags, guarded
 * observers, full teardown on unload, and it never throws into the app.
 */
import { Component, TFile, debounce, getLinkpath } from "obsidian";
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import type FileclassPlugin from "../../../main";
import { INDEXED_EVENT } from "../../schema/fileclassIndex";
import { indicatorTargetFile, LINK_SCOPE, makeIndicatorIcon, removeIndicators } from "./indicatorDom";
import { buildLivePreviewExtension, refreshLivePreviewIndicators } from "./livePreview";

interface ViewWithFile {
	file?: TFile;
}

/** A markdown view's editor exposes its CodeMirror view as `cm` (absent from the types). */
interface ViewWithEditor {
	editor?: { cm?: EditorView };
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
				// Reading view is DOM we can decorate; Live Preview is CodeMirror's, and it only
				// rebuilds when told. Without this, the editor open at startup keeps the widgets
				// it could not build before the index existed — that is to say none.
				this.guard(() => {
					const cm = (leaf.view as unknown as ViewWithEditor).editor?.cm;
					cm?.dispatch({ effects: refreshLivePreviewIndicators.of(null) });
				});
			}
		}
		// A canvas renders its text nodes as markdown, so `[[Book]]` on the schema canvas is an
		// inline link like any other — and it is *re-rendered* whenever the file is written.
		// Measured: three icons after drawing the canvas, none after a resync, and a pan or a
		// zoom never brought them back. Watched like the other non-markdown surfaces, so a
		// re-render is followed by a re-decoration.
		if (s.enableInlineLinkIndicator) this.guard(() => this.watch("canvas"));
		if (s.enableBacklinkIndicator) this.guard(() => this.watch("backlink"));
		if (s.enableBasesIndicator) this.guard(() => this.watch("bases"));
	}

	/** Observes a leaf type and decorates its links as they render. */
	private watch(viewType: string): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(viewType)) {
			const container = leaf.view.containerEl;
			const paint = () =>
				this.guard(() => {
					this.decorateLinks(container, "");
					if (viewType === "backlink") this.decorateSearchResults(container);
				});
			const decorate = debounce(paint, 100, true);
			const observer = new MutationObserver(() => decorate());
			observer.observe(container, { subtree: true, childList: true });
			this.observers.push(observer);
			paint(); // initial pass
		}
	}

	/**
	 * The backlinks pane holds no links at all: each result is a tree item whose title is a
	 * plain `div`, so the internal-link decorator above walked past every one of them and the
	 * surface never showed an icon — while the docs said it did. Measured on Obsidian 1.13:
	 * `.search-result-file-title > .tree-item-inner`, text only, no path attribute, which is
	 * why the note is resolved from its name the way a `[[link]]` would be.
	 */
	private decorateSearchResults(root: HTMLElement): void {
		root
			.querySelectorAll<HTMLElement>(".search-result-file-title .tree-item-inner")
			.forEach((title) => {
				if (title.nextElementSibling?.classList.contains(LINK_SCOPE)) return;
				const name = (title.textContent ?? "").trim();
				if (!name) return;
				const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(getLinkpath(name), "");
				const file = dest && indicatorTargetFile(this.plugin, dest.path);
				if (!file) return;
				title.insertAdjacentElement("afterend", makeIndicatorIcon(this.plugin, file, LINK_SCOPE));
			});
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
		const file = dest && indicatorTargetFile(this.plugin, dest.path);
		if (!file) return;
		link.insertAdjacentElement("afterend", makeIndicatorIcon(this.plugin, file, LINK_SCOPE));
	}
}
