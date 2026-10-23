import { Editor, MarkdownFileInfo, MarkdownView, Notice, Plugin } from 'obsidian';
import type { SponsorsManager } from './license/index';
import { createGitHubSponsors } from './license/github-obsidian';
import { SPONSORS, bindPro, isPro, onProChange, resetPro } from './pro';
import { CalloutTableFootnotesSettingTab, DEFAULT_SETTINGS, normalizeSettings, type CalloutTableFootnotesSettings } from './settings';
import { FootnotePanel } from './panel';
import { FootnoteWidgets } from './widgets';
import { convertInline, defIdOnLine, describeProblems, firstRef, panelItems, panelTarget, scanFootnotes } from './footnotes';
import { setupHello } from './hello/index';
import WHATS_NEW from './whats-new.json';

const PRO_CLASS = 'footnote-live-pro';
/** How often to ask the license state whether a check is due. It sends a request only when signed in and due (7 days). */
const PRO_TICK_MS = 6 * 60 * 60 * 1000;

export default class CalloutTableFootnotesPlugin extends Plugin {
	settings: CalloutTableFootnotesSettings = { ...DEFAULT_SETTINGS };
	/** GitHub Sponsors Pro state. Created in onload; null before that. */
	pro: SponsorsManager | null = null;
	/** Finds the labels in callouts and table cells. Created in onload. */
	widgets: FootnoteWidgets | null = null;
	private settingTab: CalloutTableFootnotesSettingTab | null = null;

	async onload(): Promise<void> {
		// First: "What's new" reads its state before the settings load (packages/hello). It does not wait.
		setupHello(this, WHATS_NEW);
		await this.loadSettings();
		// No request here: a request needs a GitHub sign in first (Settings, Pro, Sign in with GitHub).
		const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this);
		pro.init();
		this.pro = pro;
		bindPro(pro);
		this.register(pro.onChange(() => this.settingTab?.update()));
		// Pro only: a reference without a definition shows in red. The class on body works for links that are already drawn.
		const syncPro = (): void => activeDocument.body.toggleClass(PRO_CLASS, isPro());
		syncPro();
		this.register(onProChange(syncPro));
		this.settingTab = new CalloutTableFootnotesSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		const widgets = new FootnoteWidgets({ app: this.app, getSettings: () => this.settings, isPro, component: this });
		this.widgets = widgets;
		this.registerEditorExtension(widgets.extension());
		this.registerMarkdownPostProcessor((el) => widgets.schedule(el));

		this.addProCommand('show-footnotes', 'Show the footnotes of this note', 'The footnote panel', (editor) => this.showPanel(editor));
		this.addProCommand('back-to-reference', 'Go from a footnote definition to its reference', 'The way back from a definition', (editor, ctx) => this.goBack(editor, ctx.file?.path ?? null));
		this.addProCommand('convert-inline-footnote', 'Convert inline footnote to named footnote', 'The conversion of inline footnotes', (editor) => this.convertInline(editor));
		this.addProCommand('check-footnotes', 'Check for unused and missing footnotes', 'The footnote check', (editor) => {
			new Notice(describeProblems(scanFootnotes(editor.getValue())));
		});

		this.app.workspace.onLayoutReady(() => {
			void pro.refresh();
			this.registerInterval(window.setInterval(() => void pro.refresh(), PRO_TICK_MS));
		});
	}

	onunload(): void {
		activeDocument.body.removeClass(PRO_CLASS);
		this.widgets?.hide();
		this.widgets = null;
		resetPro();
	}

	/** A command that runs in an editor. Without Pro it shows a notice that names the feature. */
	private addProCommand(id: string, name: string, feature: string, run: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => void): void {
		this.addCommand({
			id,
			name,
			editorCallback: (editor, ctx) => {
				if (!isPro()) {
					new Notice(`${feature} is a pro feature. Sponsor on GitHub, then sign in from the plugin settings.`);
					return;
				}
				run(editor, ctx);
			},
		});
	}

	private showPanel(editor: Editor): void {
		const scan = scanFootnotes(editor.getValue());
		new FootnotePanel(this.app, panelItems(scan), (item) => {
			const target = panelTarget(scan, item.id);
			if (!target) return;
			editor.setCursor(target);
			editor.scrollIntoView({ from: { line: target.line, ch: 0 }, to: { line: target.line, ch: 0 } }, true);
			editor.focus();
		}).open();
	}

	/** Turns the inline footnote at the cursor into a named footnote with its definition at the end. One undo step. */
	private convertInline(editor: Editor): void {
		const plan = convertInline(editor.getValue(), editor.posToOffset(editor.getCursor()));
		if (!plan) {
			new Notice('Place the caret on a line that has an inline footnote.');
			return;
		}
		editor.transaction({ changes: plan.changes.map((c) => ({ from: editor.offsetToPos(c.from), to: editor.offsetToPos(c.to), text: c.insert })) });
		new Notice(`Footnote [^${plan.id}] added at the end of the note.`);
	}

	/** From a definition line: to the first reference. Elsewhere: back to where the last click on a reference in this note started. */
	private goBack(editor: Editor, path: string | null): void {
		const scan = scanFootnotes(editor.getValue());
		const id = defIdOnLine(scan, editor.getCursor().line);
		const target = id ? firstRef(scan, id) : this.widgets?.backTarget(path);
		if (!target || target.line > editor.lastLine()) {
			new Notice('Place the caret on a footnote definition, or click a footnote reference first.');
			return;
		}
		editor.setCursor({ line: target.line, ch: target.ch });
		editor.scrollIntoView({ from: { line: target.line, ch: 0 }, to: { line: target.line, ch: 0 } }, true);
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings((await this.loadData()) as Partial<CalloutTableFootnotesSettings> | null);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
