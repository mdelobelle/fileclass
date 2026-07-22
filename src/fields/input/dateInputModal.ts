/*
 * Date/DateTime/Time input (ARCHITECTURE.md §7). A native date-picker (like
 * Metadata Menu's calendar input) plus Today/Clear — replacing the bare text
 * prompt. Values round-trip through the field's `dateFormat` when set, else the
 * native ISO value is stored (matching the default validators). When the
 * Natural Language Dates plugin is installed, a free-text field parses phrases
 * like "next friday" into the picker (as MDM does).
 */
import { App, Modal, Setting, moment as obsidianMoment } from "obsidian";

import { Field, FieldType } from "../../schema/field";
import { dateOptions } from "../options";

/** Obsidian re-exports the callable moment fn but types it as a namespace. */
interface MomentLike {
	isValid(): boolean;
	format(fmt: string): string;
}
const moment = obsidianMoment as unknown as (input?: string, format?: string) => MomentLike;

/** Minimal shape of the nldates-obsidian plugin (private, feature-detected). */
interface NlDatesPlugin {
	parseDate(text: string): { moment: MomentLike; date: Date | null } | null;
}
interface AppWithPlugins {
	plugins?: { enabledPlugins?: Set<string>; plugins?: Record<string, unknown> };
}

function getNlDates(app: App): NlDatesPlugin | null {
	const reg = (app as unknown as AppWithPlugins).plugins;
	if (!reg?.enabledPlugins?.has("nldates-obsidian")) return null;
	const plug = reg.plugins?.["nldates-obsidian"] as NlDatesPlugin | undefined;
	return plug && typeof plug.parseDate === "function" ? plug : null;
}

const NATIVE_TYPE: Partial<Record<FieldType, string>> = {
	Date: "date",
	DateTime: "datetime-local",
	Time: "time",
};
const NATIVE_FORMAT: Partial<Record<FieldType, string>> = {
	Date: "YYYY-MM-DD",
	DateTime: "YYYY-MM-DD[T]HH:mm",
	Time: "HH:mm",
};

export class DateInputModal extends Modal {
	private inputEl!: HTMLInputElement;
	/** Store the date as a `[[wikilink]]` (like MDM's "insert as link"). */
	private insertAsLink = false;

	constructor(
		app: App,
		private readonly opts: {
			field: Field;
			initial: string;
			onSubmit: (value: string | undefined) => void;
			/**
			 * When set, a "Set next date" button advances the date by a linked
			 * Duration/MultiDuration field. It performs the full write itself (date +
			 * any interval rotation) and resolves; the modal then closes.
			 */
			onAdvance?: (currentIso: string) => Promise<boolean>;
		}
	) {
		super(app);
	}

	private get nativeFormat(): string {
		return NATIVE_FORMAT[this.opts.field.type] ?? "YYYY-MM-DD";
	}

	onOpen(): void {
		const { contentEl } = this;
		const { field } = this.opts;
		this.insertAsLink = this.isInitialLink() || dateOptions(field).defaultInsertAsLink === true;
		contentEl.createEl("h3", { text: `Set ${field.name}` });

		// Natural-language entry, only when the companion plugin is installed.
		const nl = getNlDates(this.app);
		if (nl) {
			new Setting(contentEl)
				.setName("Natural language")
				.setDesc('e.g. "next friday", "in 3 days"')
				.addText((t) => {
					t.setPlaceholder("type a date…");
					t.onChange((v) => {
						if (!v.trim()) return;
						const parsed = nl.parseDate(v);
						if (parsed?.date && parsed.moment.isValid()) {
							this.inputEl.value = parsed.moment.format(this.nativeFormat);
						}
					});
					window.setTimeout(() => t.inputEl.focus(), 0);
				});
		}

		const control = new Setting(contentEl).setName(field.type).controlEl;
		this.inputEl = control.createEl("input");
		this.inputEl.type = NATIVE_TYPE[field.type] ?? "date";
		if (field.type === "Time") this.inputEl.step = "60";
		this.prefill();
		if (!nl) window.setTimeout(() => this.inputEl.focus(), 0);

		new Setting(contentEl)
			.addExtraButton((b) =>
				b
					.setIcon("calendar-clock")
					.setTooltip("Today")
					.onClick(() => (this.inputEl.value = moment().format(this.nativeFormat)))
			)
			.addExtraButton((b) =>
				b
					.setIcon("x")
					.setTooltip("Clear")
					.onClick(() => (this.inputEl.value = ""))
			)
			.addExtraButton((b) => {
				const paint = () =>
					b
						.setIcon(this.insertAsLink ? "link" : "unlink")
						.setTooltip(this.insertAsLink ? "Stored as link — click for raw text" : "Stored as raw text — click for link");
				paint();
				b.onClick(() => {
					this.insertAsLink = !this.insertAsLink;
					paint();
				});
			})
			.addButton((b) => b.setButtonText("Save").setCta().onClick(() => this.submit()));

		if (this.opts.onAdvance) {
			const advance = this.opts.onAdvance;
			new Setting(contentEl)
				.setDesc("Advance this date by the linked interval, and cycle it to the next value.")
				.addButton((b) =>
					b
						.setButtonText("Set next date")
						.setIcon("skip-forward")
						.onClick(async () => {
							const base = this.inputEl.value || moment().format(this.nativeFormat);
							if (await advance(base)) this.close();
						})
				);
		}

		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.submit();
			}
		});
	}

	private isInitialLink(): boolean {
		return /^!?\[\[.*\]\]$/.test(this.opts.initial.trim());
	}

	/** The date text inside the initial value (unwrapping a `[[link]]` if any). */
	private initialDateText(): string {
		const raw = this.opts.initial.trim();
		const m = raw.match(/^!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/);
		if (!m) return raw;
		// Keep only the basename of the link target (drop any path prefix).
		return m[1].split("/").pop() ?? m[1];
	}

	/** Fills the native input from the current value (parsed via its format). */
	private prefill(): void {
		const text = this.initialDateText();
		if (!text) return;
		const customFmt = dateOptions(this.opts.field).dateFormat;
		const parsed = customFmt ? moment(text, customFmt) : moment(text, this.nativeFormat);
		if (parsed.isValid()) this.inputEl.value = parsed.format(this.nativeFormat);
	}

	private submit(): void {
		const raw = this.inputEl.value;
		if (!raw) {
			this.opts.onSubmit(undefined);
			this.close();
			return;
		}
		const customFmt = dateOptions(this.opts.field).dateFormat;
		// Default formats: the native value is already the stored form.
		const date = customFmt ? moment(raw, this.nativeFormat).format(customFmt) : raw;
		this.opts.onSubmit(this.insertAsLink ? this.wrapAsLink(date) : date);
		this.close();
	}

	/** Wraps the date as `[[<linkPath><date>]]` (MDM's insert-as-link form). */
	private wrapAsLink(date: string): string {
		let path = dateOptions(this.opts.field).dateLinkPath ?? "";
		if (path && !path.endsWith("/")) path += "/";
		return `[[${path}${date}]]`;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
