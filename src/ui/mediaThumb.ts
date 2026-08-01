/*
 * Thumbnails for image values (#44 follow-up).
 *
 * A `Media` field points at an image, and until now every surface showed its file
 * name: you picked a cover by reading `Kind of Blue.png`, which is the one thing a
 * cover is not for. This renders the image itself, small, wherever a media value
 * or candidate is displayed.
 *
 * Images only. The media types also accept audio, video and PDF, and there is no
 * honest thumbnail for those — a fabricated icon would say less than the extension
 * already does.
 */
import { App, TFile } from "obsidian";

import { linkTargetPath } from "../fields/links";

/** Extensions we can actually paint. Subset of the media candidate extensions. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"]);

export function isImageFile(file: TFile): boolean {
	return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

/** A thumbnail for `file`, or null when it isn't an image. */
export function thumbFor(app: App, file: TFile): HTMLElement | null {
	if (!isImageFile(file)) return null;
	const img = createEl("img", { cls: "fileclass-thumb" });
	img.src = app.vault.getResourcePath(file);
	// The name is already beside it in every caller, so the image is decorative.
	img.alt = "";
	img.setAttribute("aria-hidden", "true");
	return img;
}

/**
 * A thumbnail for a stored or displayed media value: `![[cover.png]]`,
 * `[[cover.png|alias]]` or the bare `cover.png` a display string carries.
 * Resolution goes through the vault, so a moved file still resolves by name.
 */
export function thumbForValue(app: App, value: unknown, sourcePath: string): HTMLElement | null {
	const path = linkTargetPath(app, value, sourcePath);
	if (!path) return null;
	const file = app.vault.getFileByPath(path);
	return file instanceof TFile ? thumbFor(app, file) : null;
}
