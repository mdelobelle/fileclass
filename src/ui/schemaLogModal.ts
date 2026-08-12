/*
 * Reading the schema log inside Obsidian (#159).
 *
 * The log is a `.log`, which Obsidian will not render — and reading it in a terminal is what this
 * replaces. The file stays the record; this is the window onto it.
 *
 * The point is not decoration: a log you cannot act on is read twice and then ignored. Every line
 * that names a fileClass carries a button through to its schema, so "Book › author points at
 * nothing" is one click from the field that says so.
 */
import { Modal, Notice, Setting, setIcon } from "obsidian";

import type FileclassPlugin from "../../main";
import { LOG_LEVELS, LogEntry, LogLevel } from "../log/logLine";
import { openSchemaLogFile, readSchemaLog, schemaLogPath } from "../log/schemaLog";
import { runSchemaAudit } from "../schema/schemaAuditRun";
import { openFileClassSchema } from "./fileClassSchemaModal";
import { makeStickyFooter } from "./modalFooter";
import { modalTitle } from "./modalTitle";

/** The icon each level wears, so a scroll is read by shape before it is read by word. */
const LEVEL_ICON: Record<LogLevel, string> = {
	INFO: "info",
	WARNING: "alert-triangle",
	ERROR: "octagon-alert",
};

/** Entries matching the level filter and the search text, newest first. */
export function filterEntries(
	entries: readonly LogEntry[],
	levels: ReadonlySet<LogLevel>,
	query: string
): LogEntry[] {
	const q = query.trim().toLowerCase();
	return entries
		.filter((e) => levels.has(e.level))
		.filter((e) => !q || `${e.event} ${e.message}`.toLowerCase().includes(q))
		// Newest first: a log is opened to find out what just happened.
		.slice()
		.reverse();
}

/** The fileClass a line is about, when it named one. */
function fileClassOf(entry: LogEntry): string | undefined {
	const name = entry.details?.fileClass;
	return typeof name === "string" && name ? name : undefined;
}

class SchemaLogModal extends Modal {
	private entries: LogEntry[] = [];
	private readonly levels = new Set<LogLevel>(LOG_LEVELS);
	private query = "";
	private listEl!: HTMLElement;
	private countEl!: HTMLElement;

	constructor(private readonly plugin: FileclassPlugin) {
		super(plugin.app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		modalTitle(contentEl, "Schema log");
		contentEl.addClass("fileclass-log-modal");

		this.entries = await readSchemaLog(this.plugin);

		const controls = contentEl.createDiv({ cls: "fileclass-log-controls" });
		const chips = controls.createDiv({ cls: "fileclass-log-levels" });
		for (const level of LOG_LEVELS) {
			const count = this.entries.filter((e) => e.level === level).length;
			const chip = chips.createEl("button", { cls: `fileclass-log-chip is-${level.toLowerCase()}` });
			setIcon(chip.createSpan({ cls: "fileclass-log-chip-icon" }), LEVEL_ICON[level]);
			chip.createSpan({ text: `${level.toLowerCase()} ${count}` });
			chip.toggleClass("is-off", false);
			chip.addEventListener("click", () => {
				// Filtering by clicking the count you just read, rather than through a dropdown.
				if (this.levels.has(level)) this.levels.delete(level);
				else this.levels.add(level);
				chip.toggleClass("is-off", !this.levels.has(level));
				this.renderList();
			});
		}
		new Setting(controls).setClass("fileclass-log-search").addSearch((s) =>
			s.setPlaceholder("Search messages…").onChange((v) => {
				this.query = v;
				this.renderList();
			})
		);

		this.countEl = contentEl.createDiv({ cls: "fileclass-log-count" });
		this.listEl = contentEl.createDiv({ cls: "fileclass-log-list" });
		this.renderList();

		const footer = makeStickyFooter(contentEl);
		new Setting(footer)
			.addButton((b) =>
				b.setButtonText("Open the file").onClick(() => {
					void openSchemaLogFile(this.plugin);
					this.close();
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Check now")
					.setCta()
					.onClick(() => void this.recheck())
			);
	}

	/** Re-runs the sweep and re-reads, so the window answers "and now?" without reopening. */
	private async recheck(): Promise<void> {
		await runSchemaAudit(this.plugin, true);
		this.entries = await readSchemaLog(this.plugin);
		this.renderList();
	}

	private renderList(): void {
		const shown = filterEntries(this.entries, this.levels, this.query);
		this.countEl.setText(
			this.entries.length
				? `${shown.length} of ${this.entries.length} entries`
				: `Nothing logged yet — ${schemaLogPath(this.plugin)} is written the first time something happens.`
		);
		this.listEl.empty();
		for (const entry of shown) this.renderEntry(entry);
	}

	private renderEntry(entry: LogEntry): void {
		const row = this.listEl.createDiv({ cls: `fileclass-log-row is-${entry.level.toLowerCase()}` });
		setIcon(row.createDiv({ cls: "fileclass-log-icon" }), LEVEL_ICON[entry.level]);

		const body = row.createDiv({ cls: "fileclass-log-body" });
		body.createDiv({ cls: "fileclass-log-message", text: entry.message });
		const meta = body.createDiv({ cls: "fileclass-log-meta" });
		meta.createSpan({ text: entry.stamp });
		meta.createSpan({ cls: "fileclass-log-event", text: entry.event });

		const fileClass = fileClassOf(entry);
		if (!fileClass) return;
		// The whole reason for a window rather than a file: the line and its cause, one click apart.
		const action = row.createEl("button", { cls: "fileclass-log-action" });
		setIcon(action, "wrench");
		action.setAttribute("aria-label", `Open ${fileClass}`);
		action.addEventListener("click", () => {
			if (!this.plugin.index.getFileClassFile(fileClass)) {
				new Notice(`Fileclass: "${fileClass}" no longer exists.`);
				return;
			}
			openFileClassSchema(this.plugin, fileClass);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function openSchemaLogModal(plugin: FileclassPlugin): void {
	new SchemaLogModal(plugin).open();
}
