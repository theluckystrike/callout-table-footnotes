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
