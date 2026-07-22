/*
 * Location input modal (#31). Two range-validated number inputs (latitude,
 * longitude) plus a paste field that fills them from a "lat,lon" string, and an
 * "Open in map" link (external URL — a user-triggered click, no embedded map).
 * All coordinate logic is in src/fields/location.ts (pure).
 */
import { App, Modal, Notice, Setting, TextComponent } from "obsidian";

import { formatLocation, isValidLocation, mapUrl, parseLocation } from "../location";

export interface LocationModalOptions {
	title: string;
	initial: string;
	onSubmit: (value: string) => void;
}

export class LocationInputModal extends Modal {
	private latInput!: TextComponent;
	private lonInput!: TextComponent;
	private errorEl!: HTMLElement;

	constructor(app: App, private readonly opts: LocationModalOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });
		const initial = parseLocation(this.opts.initial);

		new Setting(contentEl)
			.setName("Paste coordinates")
			.setDesc('A "lat, lon" string — fills the fields below.')
			.addText((t) => {
				t.setPlaceholder("48.8566, 2.3522").onChange((v) => this.onPaste(v));
				window.setTimeout(() => t.inputEl.focus(), 0);
			});

		new Setting(contentEl).setName("Latitude").setDesc("−90 to 90").addText((t) => {
			this.latInput = t;
			t.inputEl.type = "number";
			t.inputEl.min = "-90";
			t.inputEl.max = "90";
			t.inputEl.step = "any";
			t.setValue(initial ? String(initial.lat) : "").onChange(() => this.validateLive());
		});

		new Setting(contentEl).setName("Longitude").setDesc("−180 to 180").addText((t) => {
			this.lonInput = t;
			t.inputEl.type = "number";
			t.inputEl.min = "-180";
			t.inputEl.max = "180";
			t.inputEl.step = "any";
			t.setValue(initial ? String(initial.lon) : "").onChange(() => this.validateLive());
		});

		this.errorEl = contentEl.createDiv({ cls: "setting-item-description" });
		this.errorEl.setCssStyles({ color: "var(--text-error)", minHeight: "1.2em" });

		new Setting(contentEl)
			.addExtraButton((b) =>
				b
					.setIcon("map")
					.setTooltip("Open in map (browser)")
					.onClick(() => this.openMap())
			)
			.addButton((b) => b.setButtonText("Save").setCta().onClick(() => this.submit()));
	}

	private onPaste(value: string): void {
		const coords = parseLocation(value);
		if (!coords) return;
		this.latInput.setValue(String(coords.lat));
		this.lonInput.setValue(String(coords.lon));
		this.validateLive();
	}

	/** Current `"lat,lon"` from the two fields (may be empty/partial). */
	private current(): string {
		return `${this.latInput.getValue().trim()},${this.lonInput.getValue().trim()}`;
	}

	private isBlank(): boolean {
		return !this.latInput.getValue().trim() && !this.lonInput.getValue().trim();
	}

	private validateLive(): void {
		if (this.isBlank() || isValidLocation(this.current())) this.errorEl.setText("");
		else this.errorEl.setText("Enter a latitude (−90 to 90) and longitude (−180 to 180).");
	}

	private openMap(): void {
		const url = mapUrl(this.current());
		if (url) window.open(url, "_blank");
		else new Notice("Fileclass: enter valid coordinates first.");
	}

	private submit(): void {
		if (this.isBlank()) {
			this.opts.onSubmit("");
			this.close();
			return;
		}
		const coords = parseLocation(this.current());
		if (!coords || !isValidLocation(this.current())) {
			this.validateLive();
			return;
		}
		this.opts.onSubmit(formatLocation(coords.lat, coords.lon));
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
