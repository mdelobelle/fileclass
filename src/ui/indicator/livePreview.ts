/*
 * Live Preview field indicator (ARCHITECTURE.md §19.4, P2-bis.3b). A CodeMirror
 * editor extension that places the indicator icon after each internal link
 * pointing at a fileClass-bound note, in Live Preview. This is the most
 * Obsidian-internals-coupled surface (it reads the CM syntax tree's
 * `tokenClassNodeProp`); it is gated by the same "internal links" setting and,
 * if the token model drifts, simply produces no widgets rather than throwing.
 *
 * Deferral logic (place the icon after the whole link, incl. `|alias`) ports
 * Metadata Menu's `livePreview.ts`.
 */
import { getLinkpath, editorInfoField, TFile } from "obsidian";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree, tokenClassNodeProp } from "@codemirror/language";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";

import type FileclassPlugin from "../../../main";
import { fileWithFields, makeIndicatorIcon } from "./indicatorDom";

/** Scope class for CM-managed widgets — never touched by the DOM removers. */
const LP_SCOPE = "fileclass-indicator--lp";

class IndicatorWidget extends WidgetType {
	constructor(private readonly plugin: FileclassPlugin, private readonly file: TFile) {
		super();
	}

	eq(other: IndicatorWidget): boolean {
		return other.file.path === this.file.path;
	}

	toDOM(): HTMLElement {
		return makeIndicatorIcon(this.plugin, this.file, LP_SCOPE);
	}

	ignoreEvent(): boolean {
		// Let our own click handler run instead of the editor consuming it.
		return true;
	}
}

export function buildLivePreviewExtension(plugin: FileclassPlugin) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.build(view);
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.build(update.view);
				}
			}

			private build(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				if (!plugin.settings.enableInlineLinkIndicator) return builder.finish();

				const info = view.state.field(editorInfoField);
				const sourcePath = info?.file?.path ?? "";
				// Defer the widget so it lands after the full link (past `|alias]]`).
				let pending: { deco: Decoration; where: number } | null = null;
				const flush = () => {
					if (pending) {
						builder.add(pending.where, pending.where, pending.deco);
						pending = null;
					}
				};

				for (const { from, to } of view.visibleRanges) {
					syntaxTree(view.state).iterate({
						from,
						to,
						enter: (node) => {
							// Cast through unknown: the CM/lezer generic widens to `{}`
							// here (duplicate @lezer/common in the type graph).
							const raw = node.type.prop(tokenClassNodeProp) as unknown as
								| string
								| undefined;
							if (!raw) return;
							const props = new Set(raw.split(" "));
							const isLink = props.has("hmd-internal-link");
							const isAlias = props.has("link-alias");
							const isPipe = props.has("link-alias-pipe");

							if (!isPipe && !isAlias) flush();

							if (isLink && !isAlias && !isPipe) {
								const text = view.state.doc.sliceString(node.from, node.to).split("#")[0].trim();
								const dest = plugin.app.metadataCache.getFirstLinkpathDest(
									getLinkpath(text),
									sourcePath
								);
								const file = dest && fileWithFields(plugin, dest.path);
								if (file) {
									pending = {
										deco: Decoration.widget({
											widget: new IndicatorWidget(plugin, file),
											side: 1,
										}),
										where: node.to,
									};
								}
							} else if (isLink && isAlias && pending) {
								// Move the widget to the end of the alias, then place it.
								pending.where = node.to;
								flush();
							}
						},
					});
				}
				flush();
				return builder.finish();
			}
		},
		{ decorations: (v) => v.decorations }
	);
}
