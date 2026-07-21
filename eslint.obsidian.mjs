// Official Obsidian plugin-review ruleset (eslint-plugin-obsidianmd), run as a
// separate `npm run lint:obsidian` pass. Kept out of the main `eslint.config.js`
// because its `recommended` preset needs type information (slower) and bundles
// typescript-eslint's type-checked rules.
//
// We deliberately disable those bundled type-aware rules: the project delegates
// type checking to `tsc --noEmit` (same stance as eslint.config.js), so this
// pass focuses on the Obsidian-specific `obsidianmd/*` findings.
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{
		ignores: [
			"main.js",
			"docs/**",
			"node_modules/**",
			"tests/**",
			"cli/**",
			"esbuild.config.mjs",
			"version-bump.mjs",
			"eslint.config.js",
			"eslint.obsidian.mjs",
		],
	},
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// Type-aware rules — handled by tsc, off here to match project philosophy.
			"@typescript-eslint/no-base-to-string": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
		},
	},
];
