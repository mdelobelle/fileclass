/*
 * Applying a template to a freshly created note (#84) — adapter territory, in the spirit of D4.
 *
 * Neither template plugin has a public API. Templater exposes `write_template_to_file` on its
 * internal `templater` object. The core Templates plugin has only a command that inserts into the
 * active editor *and asks which template* — a question the class has already answered — so its
 * templates are applied directly here, with the substitutions it makes. Both are reached through
 * minimal structural interfaces and feature detection: no `any`, no dependency, and a vault with
 * neither plugin still gets its note.
 *
 * Everything Templater-shaped lives here, so the day it grows a real API there is one file to fix.
 */
import { App, Notice, TFile, moment as obsidianMoment } from "obsidian";

interface MomentLike {
	format(fmt: string): string;
}
const moment = obsidianMoment as unknown as () => MomentLike;

/** Templater's plugin instance, as much of it as this needs. */
interface TemplaterLike {
	templater?: {
		write_template_to_file?: (template: TFile, file: TFile) => Promise<void>;
	};
}

/** The core Templates plugin's settings, for its template folder. */
interface CoreTemplatesLike {
	instance?: { options?: { folder?: string } };
	enabled?: boolean;
}

/**
 * The shape this file needs, structurally — not an extension of `App`.
 *
 * `App` already declares `internalPlugins` with a narrower type, and widening it by extension is a
 * type error; the adapter's whole job is to describe what it touches and cast once, so it describes
 * it here and leaves the real `App` alone.
 */
interface AppInternals {
	plugins?: { plugins?: Record<string, unknown> };
	internalPlugins?: { getPluginById?: (id: string) => CoreTemplatesLike | undefined };
}

const internals = (app: App): AppInternals => app as unknown as AppInternals;

/**
 * The core Templates plugin's substitutions, applied to a template's text.
 *
 * `{{title}}`, `{{date}}`, `{{time}}`, and the `{{date:FORMAT}}` / `{{time:FORMAT}}` forms. The
 * plugin's own default formats are read from its settings when it has them, so a vault that
 * configured them sees its own formats rather than ours.
 */
export function applyCorePlaceholders(text: string, file: TFile, app: App): string {
	const options = internals(app).internalPlugins?.getPluginById?.("templates")?.instance?.options as
		| { dateFormat?: string; timeFormat?: string }
		| undefined;
	const dateFormat = options?.dateFormat || "YYYY-MM-DD";
	const timeFormat = options?.timeFormat || "HH:mm";
	const now = moment();
	return text
		.replace(/\{\{\s*title\s*\}\}/g, file.basename)
		.replace(/\{\{\s*date\s*:\s*([^}]+?)\s*\}\}/g, (_m, fmt: string) => now.format(fmt))
		.replace(/\{\{\s*time\s*:\s*([^}]+?)\s*\}\}/g, (_m, fmt: string) => now.format(fmt))
		.replace(/\{\{\s*date\s*\}\}/g, now.format(dateFormat))
		.replace(/\{\{\s*time\s*\}\}/g, now.format(timeFormat));
}

/** Which template engine is available, if any. */
export type TemplateEngine = "templater" | "core" | "none";

export function templateEngine(app: App): TemplateEngine {
	const a = internals(app);
	const templater = a.plugins?.plugins?.["templater-obsidian"] as TemplaterLike | undefined;
	if (templater?.templater?.write_template_to_file) return "templater";
	if (a.internalPlugins?.getPluginById?.("templates")?.enabled) return "core";
	return "none";
}

/**
 * Applies `templatePath` to `file`, and reports whether it ran.
 *
 * Templater is preferred when both are present: it is the one that can rename the file and run
 * logic, so a vault that has it configured expects it to be the one applying templates.
 *
 * A failure is a Notice and `false`, never a throw: the note exists by now, and losing it to a
 * template error would be a worse outcome than a note without its template.
 */
export async function applyTemplate(app: App, templatePath: string, file: TFile): Promise<boolean> {
	const template = app.vault.getFileByPath(templatePath);
	if (!(template instanceof TFile)) {
		new Notice(`Fileclass: template "${templatePath}" not found — the note was created without it.`);
		return false;
	}

	const engine = templateEngine(app);
	try {
		if (engine === "templater") {
			const templater = internals(app).plugins?.plugins?.["templater-obsidian"] as TemplaterLike;
			await templater.templater?.write_template_to_file?.(template, file);
			return true;
		}
		if (engine === "core") {
			// The core plugin's only command inserts into the **active editor** and asks the reader
			// which template — but the class has already named one, so firing that suggester would
			// ask a question that is already answered. The template is applied directly instead,
			// with the three substitutions the core plugin makes.
			await app.vault.modify(file, applyCorePlaceholders(await app.vault.read(template), file, app));
			return true;
		}
	} catch (err) {
		new Notice(`Fileclass: the template could not be applied (${(err as Error).message}).`);
		return false;
	}

	new Notice("Fileclass: no template plugin is enabled — the note was created without a template.");
	return false;
}
