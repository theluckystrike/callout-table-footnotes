import { describe, expect, it } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import CalloutTableFootnotesPlugin from '../src/main';
import { DEFAULT_SETTINGS, HOVER_MAX, normalizeSettings } from '../src/settings';
import manifest from '../manifest.json';

describe('CalloutTableFootnotesPlugin', () => {
	it('loads with default settings against an in-memory vault', async () => {
		const app = App.createConfigured__({ files: { 'notes/a.md': '# Hello world' } });
		const plugin = new CalloutTableFootnotesPlugin(app as never, manifest as never);
		await plugin.loadSettings();
		expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
	});

	it('repairs bad saved settings', () => {
		expect(normalizeSettings({ showNumbers: 'yes' as never, hoverPreview: 1 as never, hoverDelayMs: 'x' as never })).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({ hoverDelayMs: 99999 }).hoverDelayMs).toBe(HOVER_MAX);
		expect(normalizeSettings({ hoverDelayMs: -5 }).hoverDelayMs).toBe(0);
		expect(normalizeSettings({ showNumbers: false }).showNumbers).toBe(false);
	});
});
