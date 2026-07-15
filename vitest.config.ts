import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Unit tests are pure logic (objectPath, queryCache core, globals) with no
		// Obsidian runtime. E2E/canary tests run outside vitest (tests/e2e, §14).
		include: ["tests/unit/**/*.test.ts"],
		environment: "node",
	},
});
