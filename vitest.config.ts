import { defineConfig } from 'vitest/config';

// obsidian ships typings only, so tests run against obsidian-test-mocks in happy-dom.
// The mocks use one copy of @codemirror/state and view with the tests, so a mock state field works in a test editor.
export default defineConfig({
	resolve: { alias: { obsidian: 'obsidian-test-mocks/obsidian' }, dedupe: ['@codemirror/state', '@codemirror/view'] },
	test: {
		environment: 'happy-dom',
		setupFiles: ['obsidian-test-mocks/vitest-setup'],
		include: ['tests/**/*.test.ts'],
		server: { deps: { inline: ['obsidian-test-mocks'] } },
		// Large-input tests need more than 5 seconds on shared CI runners.
		testTimeout: 30000,
	},
});
