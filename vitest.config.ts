import { defineConfig } from 'vitest/config';
import { budget } from './tests/time-scale';

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
		testTimeout: budget(30_000),
		// Hooks get the same scale (s1108 T1). 10 s is the vitest default.
		hookTimeout: budget(10_000),
	},
});
