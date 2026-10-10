import { SuggestModal, type App } from 'obsidian';
import type { PanelItem } from './footnotes';

/** Pro: the footnotes of the open note in one searchable list. Enter goes to the definition. */
export class FootnotePanel extends SuggestModal<PanelItem> {
	constructor(
		app: App,
		private readonly items: PanelItem[],
		private readonly onChoose: (item: PanelItem) => void,
	) {
		super(app);
		this.setPlaceholder('Search the footnotes of this note');
		this.emptyStateText = 'This note has no footnotes.';
		this.setInstructions([
			{ command: 'Enter', purpose: 'go to the definition' },
			{ command: 'Esc', purpose: 'close' },
		]);
	}

	getSuggestions(query: string): PanelItem[] {
		const q = query.trim().toLowerCase();
		return this.items.filter((i) => !q || `${i.id} ${i.text} ${i.where}`.toLowerCase().includes(q));
	}

	renderSuggestion(item: PanelItem, el: HTMLElement): void {
		el.addClass('footnote-live-panel-item');
		if (item.problem) el.addClass(`is-${item.problem}`);
		el.createDiv({ cls: 'footnote-live-panel-title', text: `${item.label}. ${item.text || 'No definition'}` });
		const where = item.where ? ` in ${item.where}` : '';
		const note = item.problem === 'missing' ? 'Warning: no definition' : item.problem === 'unused' ? 'Warning: never used' : `${item.refs} ${item.refs === 1 ? 'reference' : 'references'}${where}`;
		el.createEl('small', { cls: 'footnote-live-panel-meta', text: note });
	}

	onChooseSuggestion(item: PanelItem): void {
		this.onChoose(item);
	}
}
