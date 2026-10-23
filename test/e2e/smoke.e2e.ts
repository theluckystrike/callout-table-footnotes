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
		await waitForLinks(6);
	});

	it('uses one order for body, callout, header and cell footnotes without Pro', async function () {
		expect(await labels('.cm-line')).toEqual(['1']);
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
		await waitForLinks(6);
		await browser.execute((sel: string) => document.querySelector(sel)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })), `.workspace-leaf.mod-active .cm-callout .footnote-live-link`);
		await browser.waitUntil(async () => (await cursorLine()) === 3, { timeout: 5000, timeoutMsg: 'inline Enter did not reach callout source' });
		const ch = await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getCursor().ch);
		expect(ch).toBe(INLINE_NOTE.split('\n')[3]!.indexOf('^[') + 2);
	});

	it('keeps source text and restores links after a cell edit', async function () {
		await obsidianPage.openFile(INLINE_PATH);
		await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.setCursor({ line: 0, ch: 0 }));
		await waitForLinks(6);
		await browser.executeObsidian(({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			editor?.replaceRange('New ', { line: 7, ch: 2 });
			editor?.setCursor({ line: 0, ch: 0 });
		});
		await waitForLinks(6);
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

const PARA_NOTE = [
	'Plain start line.',
	'A claim^[First **source** text.] and another^[Second [[Welcome]] and `x`].',
	'',
	'- List item^[List source.]',
	'',
	'> Quote line^[Quote source.]',
	'',
	'Named[^n] reference and `code ^[no]` and \\^[no].',
	'',
	'[^n]: Named text.',
	'',
].join('\n');
const PARA_PATH = 'Paragraph footnotes.md';
const PARA_LINK = '.workspace-leaf.mod-active .cm-line .footnote-live-link';

async function paragraphLabels(): Promise<string[]> {
	return browser.execute((sel: string) => Array.from(document.querySelectorAll(sel)).map((e) => e.textContent ?? ''), PARA_LINK);
}

async function waitForParagraphLabels(want: string[]): Promise<void> {
	await browser.waitUntil(async () => JSON.stringify(await paragraphLabels()) === JSON.stringify(want), { timeout: 15000, interval: 250, timeoutMsg: `expected paragraph numbers ${want.join(',')}` });
}

async function setCursor(line: number, ch: number): Promise<void> {
	await browser.executeObsidian(({ app }, l, c) => app.workspace.activeEditor?.editor?.setCursor({ line: l, ch: c }), line, ch);
}

/** Text that the editor shows for one line of the note. */
async function lineText(line: number): Promise<string> {
	return browser.executeObsidian(({ app }, l) => {
		const editor = app.workspace.activeEditor?.editor as unknown as { cm?: { contentDOM: HTMLElement; state: { doc: { line(n: number): { from: number } } }; domAtPos(pos: number): { node: Node } } } | undefined;
		const cm = editor?.cm;
		if (!cm) return '';
		const node = cm.domAtPos(cm.state.doc.line(l + 1).from).node;
		const el = node instanceof HTMLElement ? node : node.parentElement;
		return el?.closest('.cm-line')?.textContent ?? '';
	}, line);
}

async function setParagraphSettings(inline: boolean, named: boolean): Promise<void> {
	await browser.executeObsidian(
		async ({ app }, id, i, n) => {
			const p = (app as unknown as { plugins: { plugins: Record<string, { settings: Record<string, unknown>; widgets: { refresh(): void }; saveSettings(): Promise<void> }> } }).plugins.plugins[id]!;
			p.settings.inlineParagraphs = i;
			p.settings.namedParagraphs = n;
			await p.saveSettings();
			p.widgets.refresh();
		},
		pluginId,
		inline,
		named,
	);
}

describe(`${pluginId} inline footnotes in paragraphs in the real app`, function () {
	before(async function () {
		await setPro(false);
		await obsidianPage.write(PARA_PATH, PARA_NOTE);
		await obsidianPage.openFile(PARA_PATH);
		await setCursor(0, 0);
	});

	it('shows a number for each inline footnote off the cursor, in paragraphs, lists and quotes', async function () {
		await waitForParagraphLabels(['1', '2', '3', '4']);
		expect(await lineText(1)).toBe('A claim1 and another2.');
		expect(await browser.execute((sel: string) => document.querySelector(sel)?.parentElement?.tagName, PARA_LINK)).toBe('SUP');
		expect(await lineText(7)).toContain('^[no]');
		const appVersion = await browser.executeObsidian(({ obsidian }) => obsidian.apiVersion);
		console.info('Paragraph footnote app proof', JSON.stringify({ appVersion, labels: await paragraphLabels(), line: await lineText(1) }));
	});

	it('shows the source text while the cursor is in the footnote, and the number again after it leaves', async function () {
		await setCursor(1, PARA_NOTE.split('\n')[1]!.indexOf('First') + 2);
		await waitForParagraphLabels(['2', '3', '4']);
		expect(await lineText(1)).toContain('First');
		expect(await lineText(1)).not.toContain('A claim1');
		await setCursor(0, 0);
		await waitForParagraphLabels(['1', '2', '3', '4']);
		expect(await lineText(1)).toBe('A claim1 and another2.');
	});

	it('shows the footnote text as Markdown when the pointer rests on the number', async function () {
		await browser.execute((sel: string) => document.querySelector(sel)?.dispatchEvent(new MouseEvent('mouseenter')), PARA_LINK);
		await browser.$('.footnote-live-popover.is-shown').waitForExist({ timeout: 5000 });
		expect(await browser.$('.footnote-live-popover').getText()).toBe('First source text.');
		expect(await browser.$('.footnote-live-popover strong').getText()).toBe('source');
		await browser.executeObsidian(({ app }, id) => (app as unknown as { plugins: { plugins: Record<string, { widgets: { hide(): void } }> } }).plugins.plugins[id]!.widgets.hide(), pluginId);
	});

	it('puts the cursor at the start of the footnote text on a click', async function () {
		await browser.$$(PARA_LINK)[1]!.click();
		await browser.waitUntil(async () => (await cursorLine()) === 1, { timeout: 5000, timeoutMsg: 'click did not reach the footnote line' });
		const ch = await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getCursor().ch);
		expect(ch).toBe(PARA_NOTE.split('\n')[1]!.indexOf('Second'));
		await waitForParagraphLabels(['1', '3', '4']);
	});

	it('numbers named references in paragraphs only with the setting on', async function () {
		await setCursor(0, 0);
		await waitForParagraphLabels(['1', '2', '3', '4']);
		try {
			await setParagraphSettings(true, true);
			await waitForParagraphLabels(['1', '2', '3', '4', '5']);
			await setParagraphSettings(false, true);
			await waitForParagraphLabels(['5']);
		} finally {
			await setParagraphSettings(true, false);
		}
		await waitForParagraphLabels(['1', '2', '3', '4']);
	});

	it('leaves the note file unchanged byte for byte after editing around the footnotes', async function () {
		await browser.executeObsidian(({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			editor?.replaceRange('More words. ', { line: 0, ch: 0 });
			editor?.setCursor({ line: 1, ch: 10 });
			editor?.setCursor({ line: 3, ch: 2 });
			editor?.replaceRange('', { line: 0, ch: 0 }, { line: 0, ch: 12 });
			editor?.setCursor({ line: 0, ch: 0 });
		});
		await waitForParagraphLabels(['1', '2', '3', '4']);
		const saved = await browser.executeObsidian(async ({ app, obsidian }, path) => {
			await app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.save();
			return app.vault.adapter.read(path);
		}, PARA_PATH);
		expect(saved).toBe(PARA_NOTE);
	});

	it('keeps callout, table and paragraph numbers after an unclosed %% in prose', async function () {
		const text = ['Sale 50%% off today.', '', '> [!note] Box', '> Claim^[c] and[^n].', '', '| H | I |', '| - | - |', '| Cell[^n] | x |', '', 'After^[p].', '', '[^n]: Named.', ''].join('\n');
		await obsidianPage.write('Unclosed.md', text);
		await obsidianPage.openFile('Unclosed.md');
		await setCursor(0, 0);
		await browser.pause(3000);
		const seen = await browser.execute(() => {
			const leaf = document.querySelector('.workspace-leaf.mod-active');
			const texts = (sel: string) => Array.from(leaf?.querySelectorAll(sel) ?? []).map((e) => e.textContent ?? '');
			const after = Array.from(leaf?.querySelectorAll('.cm-line') ?? []).find((l) => (l.textContent ?? '').startsWith('After'));
			return {
				callouts: leaf?.querySelectorAll('.cm-callout').length ?? 0,
				tables: leaf?.querySelectorAll('.cm-table-widget').length ?? 0,
				callout: texts('.cm-callout .footnote-live-link'),
				table: texts('.cm-table-widget .footnote-live-link'),
				paragraph: texts('.cm-line .footnote-live-link'),
				afterIsComment: !!after?.querySelector('.cm-comment'),
				afterText: after?.textContent ?? null,
			};
		});
		console.info('Unclosed comment app proof', JSON.stringify({ appVersion: await browser.executeObsidian(({ obsidian }) => obsidian.apiVersion), ...seen }));
		// Each callout and table that Obsidian draws keeps the numbers of the shared counter.
		if (seen.callouts > 0) expect(seen.callout).toEqual(['1', '2']);
		if (seen.tables > 0) expect(seen.table).toEqual(['2']);
		// A paragraph footnote gets a number only where Obsidian's parser does not keep the comment open.
		expect(seen.paragraph).toEqual(seen.afterIsComment ? [] : ['3']);
	});

	it('Pro: converts an inline footnote to a named footnote in one undo step', async function () {
		const text = 'A^[one] and B^[two].';
		await obsidianPage.write('Convert.md', text);
		await obsidianPage.openFile('Convert.md');
		await setCursor(0, 0);
		await setPro(true);
		try {
			await browser.executeObsidianCommand(`${pluginId}:convert-inline-footnote`);
			await browser.waitUntil(async () => (await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue())) === 'A[^1] and B^[two].\n\n[^1]: one', { timeout: 5000, timeoutMsg: 'conversion did not give the named footnote' });
			await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.undo());
			expect(await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue())).toBe(text);
		} finally {
			await setPro(false);
		}
	});
});
