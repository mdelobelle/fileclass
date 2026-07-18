// Flat ESLint config (ESLint 9 + typescript-eslint). Type-aware rules are off
// (the build's `tsc --noEmit` already type-checks); this catches lint smells.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		// Build tooling (Node scripts) and generated/vendored files are not linted.
		ignores: [
			"main.js",
			"docs/**",
			"node_modules/**",
			"tests/e2e/**",
			"esbuild.config.mjs",
			"version-bump.mjs",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			// The Bases/Obsidian internals adapter needs a few justified casts.
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
			],
		},
	}
);
