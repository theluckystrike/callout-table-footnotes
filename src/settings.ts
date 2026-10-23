import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { PRO_UI, isPro } from './pro';
import type CalloutTableFootnotesPlugin from './main';
import { helloSettingItems } from './hello/settings';

export interface CalloutTableFootnotesSettings {
	/** Show the footnote number (1, 2, 3) instead of the id that you typed. */
	showNumbers: boolean;
	/** Show the definition in a small popup when the pointer rests on a reference. */
	hoverPreview: boolean;
	/** Wait in ms before the popup shows. */
	hoverDelayMs: number;
	/** Live Preview: show each inline footnote "^[text]" in a paragraph, list or blockquote as a number. */
	inlineParagraphs: boolean;
	/** Live Preview: also show each named reference "[^id]" in a paragraph, list or blockquote as a number. */
	namedParagraphs: boolean;
}

export const HOVER_MIN = 0;
export const HOVER_MAX = 2000;

export const DEFAULT_SETTINGS: CalloutTableFootnotesSettings = {
	showNumbers: true,
	hoverPreview: true,
	hoverDelayMs: 300,
	inlineParagraphs: true,
	namedParagraphs: false,
};

/** Fills gaps and drops bad values from saved data, so old or hand-edited data.json never breaks the plugin. */
export function normalizeSettings(saved: Partial<CalloutTableFootnotesSettings> | null | undefined): CalloutTableFootnotesSettings {
	const s = saved ?? {};
	const delay = typeof s.hoverDelayMs === 'number' && Number.isFinite(s.hoverDelayMs) ? Math.round(s.hoverDelayMs) : DEFAULT_SETTINGS.hoverDelayMs;
	return {
		showNumbers: typeof s.showNumbers === 'boolean' ? s.showNumbers : DEFAULT_SETTINGS.showNumbers,
		hoverPreview: typeof s.hoverPreview === 'boolean' ? s.hoverPreview : DEFAULT_SETTINGS.hoverPreview,
		hoverDelayMs: Math.min(HOVER_MAX, Math.max(HOVER_MIN, delay)),
		inlineParagraphs: typeof s.inlineParagraphs === 'boolean' ? s.inlineParagraphs : DEFAULT_SETTINGS.inlineParagraphs,
		namedParagraphs: typeof s.namedParagraphs === 'boolean' ? s.namedParagraphs : DEFAULT_SETTINGS.namedParagraphs,
	};
}

export class CalloutTableFootnotesSettingTab extends PluginSettingTab {
	plugin: CalloutTableFootnotesPlugin;

	constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], plugin: CalloutTableFootnotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		// The product rows, then the "More from NoteMods" card (packages/hello).
		return [...this.productSettingDefinitions(), ...helloSettingItems()];
	}

	productSettingDefinitions(): SettingDefinitionItem[] {
		return [
			...(this.plugin.pro ? sponsorsSettingItems(this.plugin.pro, PRO_UI) : []),
			{
				name: 'Show numbers',
				desc: 'Show each reference as its number, in the order of first use. Turn off to show the id that you typed, such as [^source].',
				control: { type: 'toggle', key: 'showNumbers', defaultValue: DEFAULT_SETTINGS.showNumbers },
			},
			{
				name: 'Inline footnotes in paragraphs',
				desc: 'In Live Preview, show each ^[text] in a paragraph, list or blockquote as a small number. Move the cursor onto it to edit the text.',
				control: { type: 'toggle', key: 'inlineParagraphs', defaultValue: DEFAULT_SETTINGS.inlineParagraphs },
			},
			{
				name: 'Also number named references in paragraphs',
				desc: 'In Live Preview, also show each [^id] in a paragraph, list or blockquote as a number in the same order.',
				control: { type: 'toggle', key: 'namedParagraphs', defaultValue: DEFAULT_SETTINGS.namedParagraphs },
			},
			{
				name: 'Hover preview',
				desc: 'Show the text of the definition in a popup when the pointer rests on a reference.',
				control: { type: 'toggle', key: 'hoverPreview', defaultValue: DEFAULT_SETTINGS.hoverPreview },
			},
			{
				name: 'Hover delay',
				desc: `Milliseconds to wait before the popup shows, from ${HOVER_MIN} to ${HOVER_MAX}.`,
				control: { type: 'slider', key: 'hoverDelayMs', defaultValue: DEFAULT_SETTINGS.hoverDelayMs, min: HOVER_MIN, max: HOVER_MAX, step: 50 },
			},
			{
				name: 'Pro features',
				desc: isPro()
					? 'Pro is on: the footnote panel, the conversion of inline footnotes, the way back from a definition and the warnings for unused and missing footnotes.'
					: 'Free version: numbered, clickable references with a hover preview in callouts, table cells and paragraphs. Pro adds the footnote panel, the conversion of inline footnotes, the way back from a definition and the warnings for unused and missing footnotes.',
			},
		];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		await super.setControlValue(key, value);
		this.plugin.settings = normalizeSettings(this.plugin.settings);
		this.plugin.widgets?.refresh();
	}
}
