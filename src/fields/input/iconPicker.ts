/*
 * Icon picker (#32): a searchable grid of real icon previews, backed by an
 * extensible source registry. Lucide is the default source; "all" adds any
 * icon registered via addIcon() (other plugins, custom SVG packs). Enumeration
 * uses getIconIds(); previews use setIcon() (via paintIcon) — no bundled list.
 */
import { App, Modal, Setting, TextComponent, getIconIds } from "obsidian";

import { normalizeIconId } from "../icon";
import { paintIcon } from "../../ui/iconSuggest";

/** Available icon sources ("banks"). Extensible: add providers without a new type. */
export const ICON_SOURCES: { id: string; label: string }[] = [
	{ id: "lucide", label: "Lucide" },
	{ id: "all", label: "All registered icons" },
];

const LUCIDE_PREFIX = "lucide-";

/** The icon ids (bare, as `setIcon` expects) offered by a source. */
export function iconIdsForSource(source: string): string[] {
	const all = getIconIds();
	const ids =
		source === "lucide" ? all.filter((id) => id.startsWith(LUCIDE_PREFIX)) : all;
	return [...new Set(ids.map(normalizeIconId))].sort();
}

const MAX_RENDERED = 240;

export interface IconPickerOptions {
	title: string;
	initial: string;
	source: string;
	onSubmit: (value: string) => void;
}

export class IconPickerModal extends Modal {
	private readonly ids: string[];
	private gridEl!: HTMLElement;
	private noteEl!: HTMLElement;

	constructor(app: App, private readonly opts: IconPickerOptions) {
		super(app);
		this.ids = iconIdsForSource(opts.source);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });

		new Setting(contentEl)
			.setName("Search")
			.addText((t: TextComponent) => {
				t.setPlaceholder("map, calendar, star…").onChange((q) => this.renderGrid(q));
				window.setTimeout(() => t.inputEl.focus(), 0);
			})
			.addExtraButton((b) =>
				b
					.setIcon("x")
					.setTooltip("Clear value")
					.onClick(() => {
						this.opts.onSubmit("");
						this.close();
					})
			);

		this.gridEl = contentEl.createDiv({ cls: "fileclass-icon-grid" });
		this.noteEl = contentEl.createDiv({ cls: "setting-item-description" });
		this.renderGrid("");
	}

	private renderGrid(query: string): void {
		const q = query.toLowerCase().trim();
		const matches = q ? this.ids.filter((id) => id.includes(q)) : this.ids;
		const shown = matches.slice(0, MAX_RENDERED);

		this.gridEl.empty();
		for (const id of shown) {
			const cell = this.gridEl.createEl("button", { cls: "fileclass-icon-cell", attr: { "aria-label": id, title: id } });
			if (id === this.opts.initial) cell.addClass("is-selected");
			paintIcon(cell.createSpan(), id);
			cell.onclick = () => {
				this.opts.onSubmit(id);
				this.close();
			};
		}

		this.noteEl.setText(
			matches.length > shown.length
				? `Showing ${shown.length} of ${matches.length} — refine your search.`
				: `${matches.length} icon${matches.length === 1 ? "" : "s"}.`
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
