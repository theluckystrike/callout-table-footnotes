import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { lastNotice, pluginId, reloadPlugin } from './load';

// Real-app checks in Live Preview: a callout and a table cell draw a footnote reference as its bare label, and the
// plugin turns each label into a numbered link. Run on minAppVersion and on the latest app (wdio.conf.mts).
const NOTE = [
	'Intro paragraph.[^1]',
	'',
	'> [!note] Findings',
	'> Yield rose[^2] and held for dry sites[^3], but not here[^gone].',
	'',
	'| Site | Result |',
	'| ---- | ------ |',
	'| North | up[^2] |',
	'| South | flat[^named] |',
	'',
	'[^1]: Method text.',
	'[^2]: Yield text.',
	'[^3]: Dry text.',
	'[^named]: Named text.',
	'[^old]: Unused text.',
	'',
].join('\n');
const PATH = 'Footnotes.md';
const LINK = '.workspace-leaf.mod-active .footnote-live-link';

/** Text of each footnote link in a part of the note. */
async function labels(scope: string): Promise<string[]> {
	return browser.execute((sel: string) => Array.from(document.querySelectorAll(sel)).map((e) => e.textContent ?? ''), `.workspace-leaf.mod-active ${scope} .footnote-live-link`);
}

async function waitForLinks(count: number): Promise<void> {
	await browser.waitUntil(async () => (await browser.$$(LINK).length) === count, { timeout: 15000, interval: 250, timeoutMsg: `expected ${count} footnote links` });
}

async function cursorLine(): Promise<number> {
	return browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getCursor().line ?? -1);
}

/** Pro on: a stubbed GitHub Sponsors reply ($5 a month) and a fake token, then Refresh. Pro off: sign out. No real request. */
async function setPro(on: boolean): Promise<void> {
	await browser.executeObsidian(
		async ({ app }, id, value) => {
			interface Pro {
				opts: { http: unknown };
				refreshNow(): Promise<void>;
				signOut(): void;
			}
			const p = (app as unknown as { plugins: { plugins: Record<string, { pro: Pro }> } }).plugins.plugins[id]!;
			if (!value) {
				p.pro.signOut();
				return;
			}
			const reply = { status: 200, json: { data: { viewer: { login: 'demo-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } };
			p.pro.opts.http = () => Promise.resolve(reply);
			app.secretStorage.setSecret(`${id}-github-token`, 'gho_' + '0'.repeat(36));
			await p.pro.refreshNow();
		},
		pluginId,
		on,
	);
}

describe(`${pluginId} in the real app`, function () {
	before(async function () {
		await obsidianPage.write(PATH, NOTE);
		await obsidianPage.openFile(PATH);
		await waitForLinks(5);
	});

	it('is enabled and reloads with no console errors', async function () {
		const state = await reloadPlugin(pluginId);
		expect(state).toEqual({ enabled: true, reloaded: true, errors: [] });
		await obsidianPage.openFile(PATH);
		await waitForLinks(5);
	});

	it('turns the bare labels in a callout and in table cells into numbered links', async function () {
		expect(await labels('.cm-callout')).toEqual(['2', '3', 'gone']);
		expect(await labels('.cm-table-widget')).toEqual(['2', '4']);
	});

	it('goes to the definition when you click a reference in a callout', async function () {
		await browser.$$(`${LINK}`)[0]!.click();
		await browser.waitUntil(async () => (await cursorLine()) === NOTE.split('\n').indexOf('[^2]: Yield text.'), { timeout: 5000, timeoutMsg: 'cursor did not reach [^2]' });
	});

	it('goes to the definition when you click a reference in a table cell', async function () {
		await obsidianPage.openFile(PATH);
		await waitForLinks(5);
		const links = await browser.$$(`.workspace-leaf.mod-active .cm-table-widget .footnote-live-link`);
		await links[1]!.click();
		await browser.waitUntil(async () => (await cursorLine()) === NOTE.split('\n').indexOf('[^named]: Named text.'), { timeout: 5000, timeoutMsg: 'cursor did not reach [^named]' });
	});

	it('shows the definition when the pointer rests on a reference', async function () {
		await obsidianPage.openFile(PATH);
		await waitForLinks(5);
		// Live Preview may draw the widget a second time just after the links appear, so the pointer moves again until the popup shows.
		let nudge = 0;
		await browser.waitUntil(
			async () => {
				nudge = (nudge + 3) % 7;
				await browser.$$(`.workspace-leaf.mod-active .cm-callout .footnote-live-link`)[1]!.moveTo({ xOffset: nudge });
				await browser.pause(700);
				return (await browser.$('.footnote-live-popover.is-shown').isExisting()) && (await browser.$('.footnote-live-popover').getText()) === 'Dry text.';
			},
			{ timeout: 15000, interval: 100, timeoutMsg: 'no popup with the definition' },
		);
	});

	it('keeps the links after an edit and after the cursor enters a table cell', async function () {
		await browser.executeObsidian(({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			editor?.replaceRange(' More.', { line: 0, ch: 20 });
		});
		await waitForLinks(5);
		await browser.$$('.workspace-leaf.mod-active .cm-table-widget .table-cell-wrapper')[2]!.click();
		await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.setCursor({ line: 0, ch: 0 }));
		await waitForLinks(5);
	});

	it('asks for Pro on a Pro command and opens nothing', async function () {
		await setPro(false);
		await browser.executeObsidianCommand(`${pluginId}:show-footnotes`);
		await browser.waitUntil(async () => /pro feature/.test(await lastNotice()), { timeout: 5000, timeoutMsg: 'no Pro notice' });
		expect(await browser.$('.prompt').isExisting()).toBe(false);
	});

	it('Pro: lists the footnotes, checks them and goes back from a definition', async function () {
		await setPro(true);
		await browser.executeObsidianCommand(`${pluginId}:show-footnotes`);
		await browser.$('.prompt').waitForExist({ timeout: 5000 });
		const rows = await browser.$$('.prompt .suggestion-item').map((r) => r.getText());
		expect(rows.length).toBe(6);
		expect(rows[0]).toContain('1. Method text.');
		expect(rows.some((r) => r.includes('Warning: no definition'))).toBe(true);
		expect(rows.some((r) => r.includes('Warning: never used'))).toBe(true);
		await browser.keys('Escape');
		await browser.executeObsidianCommand(`${pluginId}:check-footnotes`);
		await browser.waitUntil(async () => (await lastNotice()).includes('[^gone]') && (await lastNotice()).includes('[^old]'), { timeout: 5000, timeoutMsg: 'check notice missing' });
		await browser.executeObsidian(({ app }, line) => app.workspace.activeEditor?.editor?.setCursor({ line, ch: 8 }), NOTE.split('\n').indexOf('[^2]: Yield text.'));
		await browser.executeObsidianCommand(`${pluginId}:back-to-reference`);
		await browser.waitUntil(async () => (await cursorLine()) === 3, { timeout: 5000, timeoutMsg: 'did not go back to the first reference of [^2]' });
		await setPro(false);
	});
});

const INLINE_NOTE = [
	'Inline source test^[First in the note.].',
	'',
	'> [!note] Inline sources',
	'> A claim^[**Callout** source.] and a named source[^n].',
	'',
	'| Header^[Header source.] | Other |',
	'| --- | --- |',
	'| Cell^[**Cell** source.] | Named[^n] |',
	'',
	'[^n]: Named source.',
	'',
].join('\n');
const INLINE_PATH = 'Inline footnotes.md';

describe(`${pluginId} inline footnotes in the real app`, function () {
	before(async function () {
		await setPro(false);
		await obsidianPage.write(INLINE_PATH, INLINE_NOTE);
		await obsidianPage.openFile(INLINE_PATH);
		await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.setCursor({ line: 0, ch: 0 }));
		await waitForLinks(5);
	});

	it('uses one order for body, callout, header and cell footnotes without Pro', async function () {
		expect(await labels('.cm-callout')).toEqual(['2', '3']);
		expect(await labels('.cm-table-widget')).toEqual(['4', '5', '3']);
		expect(await browser.$('.workspace-leaf.mod-active .cm-callout section.footnotes').isExisting()).toBe(false);
	});

	it('shows Markdown text when the pointer rests on an inline link', async function () {
		await browser.execute((sel: string) => document.querySelector(sel)?.dispatchEvent(new MouseEvent('mouseenter')), `.workspace-leaf.mod-active .cm-callout .footnote-live-link`);
		await browser.$('.footnote-live-popover.is-shown').waitForExist({ timeout: 5000 });
		expect(await browser.$('.footnote-live-popover').getText()).toBe('Callout source.');
		expect(await browser.$('.footnote-live-popover strong').getText()).toBe('Callout');
	});

	it('clicks a table inline link to reach its own text', async function () {
		await browser.execute((sel: string) => {
			const links = document.querySelectorAll<HTMLElement>(sel);
			links[1]?.click();
		}, `.workspace-leaf.mod-active .cm-table-widget .footnote-live-link`);
		await browser.waitUntil(async () => (await cursorLine()) === 7, { timeout: 5000, timeoutMsg: 'inline table jump did not reach the cell source' });
		const ch = await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getCursor().ch);
		expect(ch).toBe(INLINE_NOTE.split('\n')[7]!.indexOf('^[') + 2);
	});

	it('presses Enter on a callout inline link to reach its source text', async function () {
		await obsidianPage.openFile(INLINE_PATH);
		await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.setCursor({ line: 0, ch: 0 }));
		await waitForLinks(5);
		await browser.execute((sel: string) => document.querySelector(sel)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })), `.workspace-leaf.mod-active .cm-callout .footnote-live-link`);
		await browser.waitUntil(async () => (await cursorLine()) === 3, { timeout: 5000, timeoutMsg: 'inline Enter did not reach callout source' });
		const ch = await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getCursor().ch);
		expect(ch).toBe(INLINE_NOTE.split('\n')[3]!.indexOf('^[') + 2);
	});

	it('keeps source text and restores links after a cell edit', async function () {
		await obsidianPage.openFile(INLINE_PATH);
		await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.setCursor({ line: 0, ch: 0 }));
		await waitForLinks(5);
		await browser.executeObsidian(({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			editor?.replaceRange('New ', { line: 7, ch: 2 });
			editor?.setCursor({ line: 0, ch: 0 });
		});
		await waitForLinks(5);
		expect(await labels('.cm-table-widget')).toEqual(['4', '5', '3']);
		const text = await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue());
		expect(text).toBe(INLINE_NOTE.replace('| Cell^[', '| New Cell^['));
	});
});


describe(`${pluginId} nested named references in the real app`, function () {
	it('checks nested references, navigates to their source and leaves the note unchanged', async function () {
		const text = [
			'Body[^a]', '', '> [!note] Nested sources', '> Read[^b]', '',
			'[^a]: See [^b]', '  Also [^c] and [^missing]',
			'[^b]: Detail', '[^c]: More detail', '[^old]: Never referenced',
		].join('\n');
		await obsidianPage.write('Nested footnotes.md', text);
		await obsidianPage.openFile('Nested footnotes.md');
		await waitForLinks(1);
		await setPro(true);
		try {
			await browser.executeObsidianCommand(`${pluginId}:check-footnotes`);
			await browser.waitUntil(async () => (await lastNotice()) === 'Footnotes: 1 without a definition ([^missing]); 1 never used ([^old]).', { timeout: 5000, timeoutMsg: 'nested-reference diagnostics were incorrect' });
			await browser.executeObsidianCommand(`${pluginId}:show-footnotes`);
			await browser.$('.prompt').waitForExist({ timeout: 5000 });
			const rows = await browser.$$('.prompt .suggestion-item').map((row) => row.getText());
			expect(rows.length).toBe(5);
			expect(rows.filter((row) => row.includes('Warning: never used')).length).toBe(1);
			await browser.keys('Escape');
			await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.setCursor({ line: 8, ch: 6 }));
			await browser.executeObsidianCommand(`${pluginId}:back-to-reference`);
			await browser.waitUntil(async () => (await cursorLine()) === 6, { timeout: 5000, timeoutMsg: 'did not return to the continuation reference' });
			const cursor = await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getCursor());
			expect(cursor).toEqual({ line: 6, ch: 7 });
			const appVersion = await browser.executeObsidian(({ obsidian }) => obsidian.apiVersion);
			console.info('Nested footnote app proof', JSON.stringify({ appVersion, cursor, rows, notice: await lastNotice() }));
			expect(await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue())).toBe(text);
		} finally {
			await setPro(false);
		}
	});
});


describe(`${pluginId} definition fences in the real app`, function () {
	it('protects the four peer counterexamples and retains later navigation', async function () {
		const cases = [
			['```md', '  [^hidden]', '  ```'],
			['~~~md', '  [^hidden]', '  ~~~'],
			['Detail', '  ````md', '  ```', '  [^hidden]', '  ````'],
			['Detail', '  ```md', '  ~~~', '  [^hidden]', '  ```'],
		];
		await setPro(true);
		try {
			for (const [body, ...continuation] of cases) {
				const lines = ['Use[^a]', `[^a]: ${body}`, ...continuation, 'Use[^b]', '[^b]: Detail'];
				const text = lines.join('\n');
				await obsidianPage.write('Fenced definition.md', text);
				await obsidianPage.openFile('Fenced definition.md');
				await browser.executeObsidianCommand(`${pluginId}:check-footnotes`);
				await browser.waitUntil(async () => (await lastNotice()) === 'Footnotes: all 2 have a reference and a definition.', { timeout: 5000, timeoutMsg: 'fenced code leaked into diagnostics or hid the later definition' });
				await browser.executeObsidianCommand(`${pluginId}:show-footnotes`);
				await browser.$('.prompt').waitForExist({ timeout: 5000 });
				const rows = await browser.$$('.prompt .suggestion-item').map((row) => row.getText());
				expect(rows.length).toBe(2);
				expect(rows.some((row) => row.includes('Warning:'))).toBe(false);
				expect(rows[1]).toContain('2. Detail');
				await browser.keys('Escape');
				await browser.executeObsidian(({ app }, line) => app.workspace.activeEditor?.editor?.setCursor({ line, ch: 6 }), lines.length - 1);
				await browser.executeObsidianCommand(`${pluginId}:back-to-reference`);
				await browser.waitUntil(async () => (await cursorLine()) === lines.length - 2, { timeout: 5000, timeoutMsg: 'later reference lost after definition fence' });
				const cursor = await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getCursor());
				expect(cursor).toEqual({ line: lines.length - 2, ch: 3 });
				expect(await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue())).toBe(text);
				console.info('Definition fence app proof', JSON.stringify({ body, continuation, cursor, rows, notice: await lastNotice(), appVersion: await browser.executeObsidian(({ obsidian }) => obsidian.apiVersion) }));
			}
		} finally {
			await setPro(false);
		}
	});
});
