/*
 * Matching what a scenario *says* against what the app *exposes*.
 *
 * Subtitles name real UI — a command, a setting, a field type — so when one of
 * those drifts the take lies. This scans each step for names the running plugin
 * actually has, and flags a step that promises one without naming any.
 *
 * Pure on purpose: the facts come from CDP (smoke.mjs), the judgement is here and
 * can be checked without launching anything.
 */

/** A step that tells the viewer to run something. */
const CLAIMS_COMMAND = /\b(run|command palette|palette)\b/i;
/**
 * A step that *sets* something in the settings — "open the settings" is
 * navigation and names nothing, which is fine; "set X in the settings" should
 * name what it sets.
 */
const CLAIMS_SETTING = /\bsettings?\b/i;
const SETS_SOMETHING = /\b(set|change|fill|point|enter|type)\b/i;

/** Names of `list` that appear in `title`, case-insensitively. */
export function mentions(title, list) {
	const lower = title.toLowerCase();
	return list.filter((name) => name && lower.includes(name.toLowerCase()));
}

/**
 * Commands a subtitle names, allowing the natural shortening: a script says
 * "run Insert missing fields" where the command is "Insert missing fields in
 * current file". A prefix of three words or more counts (or the whole name when
 * it is shorter), which keeps "Create a class" from matching "Create a base for a
 * class".
 */
export function mentionsCommands(title, commands) {
	const lower = title.toLowerCase();
	return commands.filter((name) => {
		const words = name.split(/\s+/);
		if (words.length <= 3) return lower.includes(name.toLowerCase());
		for (let n = words.length; n >= 3; n--) {
			if (lower.includes(words.slice(0, n).join(" ").toLowerCase())) return true;
		}
		return false;
	});
}

/**
 * Field types are matched as capitalised words, so "The input is a switch" isn't
 * read as the `Input` type while "type Input" is.
 */
export function mentionsTypes(title, types) {
	return types.filter((type) => new RegExp(`\\b${type}\\b`).test(title));
}

/**
 * One verdict per step: what it names, and whether it promises UI it doesn't name.
 * @param steps    scenario steps ({ title })
 * @param facts    { commands, settingNames, fieldTypes } read from the app
 */
export function scanScript(steps, { commands = [], settingNames = [], fieldTypes = [] }) {
	return steps.map((step, i) => {
		const foundCommands = mentionsCommands(step.title, commands);
		const foundSettings = mentions(step.title, settingNames);
		const foundTypes = mentionsTypes(step.title, fieldTypes);
		const claimsCommand = CLAIMS_COMMAND.test(step.title) && !foundCommands.length;
		const claimsSetting =
			CLAIMS_SETTING.test(step.title) && SETS_SOMETHING.test(step.title) && !foundSettings.length;
		return {
			index: i + 1,
			title: step.title,
			commands: foundCommands,
			settings: foundSettings,
			types: foundTypes,
			claimsCommand,
			claimsSetting,
			suspicious: claimsCommand || claimsSetting,
		};
	});
}

/** FIELD_TYPES, read from the plugin source so the list can't drift. */
export function fieldTypesFromSource(source) {
	const start = source.indexOf("FIELD_TYPES = [");
	const end = source.indexOf("] as const", start);
	if (start === -1 || end === -1) return [];
	return [...source.slice(start, end).matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
}
