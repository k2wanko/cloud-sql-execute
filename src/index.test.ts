import { expect, test } from "bun:test";

test("basic functionality", () => {
	// Basic test to ensure the test framework works
	expect(1 + 1).toBe(2);
});

test("environment variable parsing", () => {
	// Test environment variable helpers
	process.env.TEST_VAR = "true";
	const getEnvBoolean = (envVar: string): boolean => {
		const value = process.env[envVar];
		return value === "true" || value === "1";
	};

	expect(getEnvBoolean("TEST_VAR")).toBe(true);
	expect(getEnvBoolean("NON_EXISTENT_VAR")).toBe(false);

	delete process.env.TEST_VAR;
});
