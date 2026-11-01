// "What Pro adds" for this plugin: the Pro lines of pro-features.ts, each with a demo that runs the real plugin code on
// a sample note in the window. A demo never reads or writes a vault file and never turns Pro on for a real note.
import type { App } from 'obsidian';
import type { SponsorsManager } from './license/index';
import { demoText, showWhatProAdds, type WhatProDemoFeature, type WhatProModal } from './license/github-obsidian';
import { applyChanges, convertInline, defIdOnLine, describeProblems, firstRef, panelItems, scanFootnotes } from './footnotes';
import { PRO_FEATURES } from './pro-features';
import { PRO_UI, SPONSORS } from './pro';

export const SAMPLE_NOTE = [
	'> [!note] Field notes',
	'> The river rose fast[^rain] after the storm[^storm].',
	'',
	'| Site | Level |',
	'| --- | --- |',
	'| North[^north] | 2.4 m[^risk] |',
	'',
	'The second gauge agreed^[Gauge log, 3 October.] with the first.',
	'',
	'[^rain]: Rain gauge data, 3 October.',
	'[^storm]: Storm report of the county.',
	'[^north]: North bank station.',
	'[^old]: A note that no reference uses.',
].join('\n');

const lineOf = (text: string, needle: string): number => text.split('\n').findIndex((l) => l.includes(needle));

const DEMOS: Record<string, (el: HTMLElement) => void> = {
	panel: (el) => {
		const rows = panelItems(scanFootnotes(SAMPLE_NOTE)).map((i) => {
			const meta = i.problem === 'missing' ? 'Warning: no definition' : i.problem === 'unused' ? 'Warning: never used' : `${i.refs} ${i.refs === 1 ? 'reference' : 'references'}${i.where ? ` in ${i.where}` : ''}`;
			return `${i.label}. ${i.text || 'No definition'}  (${meta})`;
		});
		demoText(el, 'The footnote panel for the sample note:', rows.join('\n'));
	},
	convert: (el) => {
		const offset = SAMPLE_NOTE.indexOf('^[');
		const plan = convertInline(SAMPLE_NOTE, offset);
		if (!plan) throw new Error('no inline footnote in the sample');
		const after = applyChanges(SAMPLE_NOTE, plan.changes);
		const changed = after.split('\n').filter((l) => l.includes(`[^${plan.id}]`));
		demoText(el, 'Before:', SAMPLE_NOTE.split('\n')[lineOf(SAMPLE_NOTE, '^[')] ?? '');
		demoText(el, `After, with the new footnote [^${plan.id}]:`, changed.join('\n'));
	},
	back: (el) => {
		const scan = scanFootnotes(SAMPLE_NOTE);
		const defLine = lineOf(SAMPLE_NOTE, '[^rain]:');
		const id = defIdOnLine(scan, defLine);
		const ref = id ? firstRef(scan, id) : null;
		if (!id || !ref) throw new Error('no reference for the sample definition');
		const refText = SAMPLE_NOTE.split('\n')[ref.line] ?? '';
		demoText(el, `The cursor is on line ${defLine + 1}, the definition of [^${id}]. The command moves it to line ${ref.line + 1}, column ${ref.ch + 1}:`, refText);
	},
	check: (el) => {
		demoText(el, 'The notice for the sample note:', describeProblems(scanFootnotes(SAMPLE_NOTE)));
	},
	'missing-red': (el) => {
		el.createEl('p', { text: 'A table cell of the sample note, with the reference [^risk] that has no definition:', cls: 'pf-whatpro-demo-label' });
		// The plugin's own style (styles.css) draws the missing reference in red inside the Pro class.
		const cell = el.createDiv({ cls: 'footnote-live-pro' }).createSpan({ text: '2.4 m' });
		const ref = cell.createSpan({ cls: 'footnote-live-ref' });
		ref.createSpan({ cls: 'footnote-live-link is-missing', text: 'risk' });
	},
};

export function whatProFeatures(): WhatProDemoFeature[] {
	return PRO_FEATURES.map((f) => ({ ...f, demo: DEMOS[f.id] ?? ((el: HTMLElement) => void el.createEl('p', { text: f.line })) }));
}

export function openWhatPro(app: App, pro: SponsorsManager | null, pluginId: string, pluginName: string): WhatProModal {
	return showWhatProAdds(app, pro, { pluginId, pluginName, features: whatProFeatures(), priceText: PRO_UI.priceText }, SPONSORS);
}
