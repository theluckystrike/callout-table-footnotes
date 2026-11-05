import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingGates, whatProModel, whatProUrl } from '../src/license/github-obsidian';
import { PRO_FEATURES } from '../src/pro-features';
import { PRO_UI, SPONSORS } from '../src/pro';
import { SAMPLE_NOTE, whatProFeatures } from '../src/what-pro';
import manifest from '../manifest.json';

const ROOT = join(import.meta.dirname, '..');
const read = (file: string): string | null => {
	try {
		return readFileSync(join(ROOT, file), 'utf8');
	} catch {
		return null;
	}
};
const demo = (id: string): HTMLElement => {
	const el = document.createElement('div');
	const f = whatProFeatures().find((x) => x.id === id);
	if (!f) throw new Error(`no feature ${id}`);
	f.demo(el);
	return el;
};

describe('What Pro adds: feature list', () => {
	it('lists the 5 Pro features of the plugin, one line each', () => {
		expect(PRO_FEATURES.map((f) => f.id)).toEqual(['panel', 'convert', 'back', 'check', 'missing-red']);
		for (const f of PRO_FEATURES) expect(f.line).toMatch(/^[A-Z].{20,160}\.$/);
		expect(whatProFeatures().map((f) => f.line)).toEqual(PRO_FEATURES.map((f) => f.line));
	});

	it('each listed feature has its Pro gate in src', () => {
		expect(missingGates(PRO_FEATURES, read)).toEqual([]);
	});

	it('negative control: a listed feature without a gate in src fails the gate check', () => {
		const ghost = { id: 'ghost', line: 'Export the footnotes to a PDF.', gate: { file: 'src/main.ts', text: "this.addProCommand('export-pdf'" } };
		expect(missingGates([...PRO_FEATURES, ghost], read)).toEqual(['ghost']);
	});

	it('the README Pro section has the same lines and the same price text', () => {
		const readme = read('README.md') ?? '';
		const section = readme.slice(readme.indexOf('\n## Pro\n'));
		expect(section.startsWith('\n## Pro\n')).toBe(true);
		for (const f of PRO_FEATURES) expect(section).toContain(`\n- ${f.line}\n`);
		expect(section).toContain(PRO_UI.priceText);
	});
});

describe('What Pro adds: price and button', () => {
	it('the Sponsor $15 once button opens the one-time tab with metadata_source=<plugin id>-whatpro', () => {
		const m = whatProModel(null, { pluginId: manifest.id, features: PRO_FEATURES, priceText: PRO_UI.priceText }, SPONSORS);
		expect(m.sponsorText).toBe('Sponsor $15 once');
		expect(m.sponsorUrl).toBe('https://github.com/sponsors/theluckystrike?frequency=one-time&metadata_source=callout-table-footnotes-whatpro-all');
		expect(m.sponsorUrl).toBe(whatProUrl(SPONSORS, manifest.id));
		expect(m.priceText).toBe(PRO_UI.priceText);
	});
});

describe('What Pro adds: demos on the sample note', () => {
	it('panel: lists the footnotes in order, then the missing and the unused one', () => {
		const text = demo('panel').querySelector('code')?.textContent ?? '';
		expect(text.split('\n')).toEqual([
			'1. Rain gauge data, 3 October.  (1 reference in callout)',
			'2. Storm report of the county.  (1 reference in callout)',
			'3. North bank station.  (1 reference in table)',
			'4. Gauge log, 3 October.  (1 reference in body)',
			'risk. No definition  (Warning: no definition)',
			'old. A note that no reference uses.  (Warning: never used)',
		]);
	});

	it('convert: the inline footnote becomes [^1] with its definition at the end', () => {
		const codes = [...demo('convert').querySelectorAll('code')].map((c) => c.textContent);
		expect(codes[0]).toBe('The second gauge agreed^[Gauge log, 3 October.] with the first.');
		expect(codes[1]).toBe('The second gauge agreed[^1] with the first.\n[^1]: Gauge log, 3 October.');
	});

	it('back: from the definition of [^rain] to its reference in the callout', () => {
		const el = demo('back');
		expect(el.querySelector('p')?.textContent).toBe('The cursor is on line 10, the definition of [^rain]. The command moves it to line 2, column 22:');
		expect(el.querySelector('code')?.textContent).toBe('> The river rose fast[^rain] after the storm[^storm].');
	});

	it('check: names the missing and the unused footnote', () => {
		expect(demo('check').querySelector('code')?.textContent).toBe('Footnotes: 1 without a definition ([^risk]); 1 never used ([^old]).');
	});

	it('missing-red: draws the missing reference with the classes of the Pro style', () => {
		const link = demo('missing-red').querySelector('.footnote-live-pro .footnote-live-link.is-missing');
		expect(link?.textContent).toBe('risk');
	});

	it('the demos do not change the sample note', () => {
		const before = SAMPLE_NOTE;
		for (const f of whatProFeatures()) f.demo(document.createElement('div'));
		expect(SAMPLE_NOTE).toBe(before);
	});
});

describe('What Pro adds: entry points', () => {
	const main = read('src/main.ts') ?? '';
	it('has one command and opens the window only from a user action', () => {
		expect(main).toContain("this.addCommand({ id: 'what-pro-adds', name: WHAT_PRO_TITLE, callback: () => this.openWhatPro() });");
		// onload never opens it: the only calls are inside callbacks.
		const onload = main.slice(main.indexOf('async onload()'), main.indexOf('onunload()'));
		expect(onload.match(/openWhatPro\(\)/g)).toHaveLength(2);
		expect(onload).toContain('bindWhatPro(() => this.openWhatPro());');
	});
	it('has the settings button and the notice link', () => {
		expect(read('src/settings.ts')).toContain('sponsorsSettingItemsWithWhatPro(this.plugin.pro, PRO_UI, () => this.plugin.openWhatPro())');
		expect(read('src/pro.ts')).toContain('showProNoticeWithWhatPro(manager, lead, () => whatPro?.());');
	});
});
