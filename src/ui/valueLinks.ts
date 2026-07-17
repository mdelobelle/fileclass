/*
 * Renders a field value string into a container, turning wikilinks into
 * clickable internal links (File/MultiFile/Media values, insert-as-link dates,
 * or any value containing `[[…]]`). Reuses the pure wikilink splitter from the
 * custom Bases view so both surfaces parse links identically.
 */
import { App } from "obsidian";

import { parseCellSegments } from "../views/columns";

export function renderValueWithLinks(
	parent: HTMLElement,
	text: string,
	sourcePath: string,
	app: App,
	/** Optional indicator icon injected after a link (null = none for that link). */
	makeIndicator?: (linktext: string) => HTMLElement | null
): void {
	for (const seg of parseCellSegments(text)) {
		if ("link" in seg) {
			const a = parent.createEl("a", { cls: "internal-link", text: seg.display });
			a.setAttribute("data-href", seg.link);
			a.setAttribute("href", seg.link);
			a.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				app.workspace.openLinkText(seg.link, sourcePath, e.ctrlKey || e.metaKey);
			});
			const icon = makeIndicator?.(seg.link);
			if (icon) parent.appendChild(icon);
		} else {
			// A span (not a bare text node) so it can truncate in the flex row.
			parent.createSpan({ cls: "fc-seg", text: seg.text });
		}
	}
}
