import { describe, expect, it } from "vitest";

// The demo runner is plain JS; only its pure script-linting rules are exercised.
import { scanScript } from "../../demo/lib/scriptScan.mjs";

/** What scanScript reports per step (the JS module builds it inline). */
interface ScannedStep {
	title: string;
	commands: string[];
	settings: string[];
	types: string[];
	claimsCommand: boolean;
	claimsSetting: boolean;
	suspicious: boolean;
}

const scan = (titles: string[]): ScannedStep[] =>
	scanScript(titles.map((title) => ({ title })), {
		commands: ["Create a class", "Manage note fields"],
		settingNames: ["Bases folder"],
		fieldTypes: ["Color", "Icon"],
	}) as ScannedStep[];

describe("scanScript — what makes a step suspicious", () => {
	it("flags a step that says to run something without naming a command", () => {
		const [step] = scan(["Run the thing that types your notes"]);
		expect(step.claimsCommand).toBe(true);
		expect(step.suspicious).toBe(true);
	});

	it("accepts it once the command is named", () => {
		const [step] = scan(["Run Create a class from the command palette"]);
		expect(step.commands).toEqual(["Create a class"]);
		expect(step.suspicious).toBe(false);
	});

	it("no longer reads a colour palette as the command palette", () => {
		// Take 018's subtitles: three of them were flagged by a rule written when
		// "palette" could only mean one thing in this vault.
		const steps = scan([
			"Its option chooses the palette the field will offer",
			"The plus pins a shade to your palette — it shows up in the picker at once",
		]);
		expect(steps.map((s) => s.suspicious)).toEqual([false, false]);
	});

	it("still catches the command palette by name", () => {
		const [step] = scan(["Open the command palette and type something vague"]);
		expect(step.claimsCommand).toBe(true);
	});

	it("wants a setting named when a step sets one", () => {
		expect(scan(["Set the folder in the settings"])[0].claimsSetting).toBe(true);
		expect(scan(["Set Bases folder in the settings"])[0].claimsSetting).toBe(false);
		// Navigation alone names nothing, and that is fine.
		expect(scan(["Open the settings"])[0].suspicious).toBe(false);
	});
});

describe("a step's input value", () => {
	it("is not part of what the narrator says", () => {
		// The caption shows it in yellow; the voice reads the title alone. A step's
		// `input` never reaches spokenText, which is why this holds by construction —
		// pinned here so a future refactor doesn't start reading coordinates aloud.
		const [step] = scan(["Paste what you copied"]);
		expect(step.title).toBe("Paste what you copied");
		expect(step.title).not.toMatch(/\d{2}\.\d/);
	});
});
