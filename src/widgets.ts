// Live Preview draws a callout and a table as widgets and shows a footnote reference in them as its bare label ("2").
// This module finds each label again and swaps it for a numbered link. It uses public API only: an editor extension
// (a ViewPlugin) to get the EditorView of each editor, and a Markdown post processor that Obsidian runs on each widget.
import { Component, MarkdownRenderer, type App } from 'obsidian';
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { MAX_BLOCK_LINES, blockFrom, widgetSource, definitionOf, firstRef, labelOf, locateRefs, scanFootnotes, type FootnoteScan, type Located } from './footnotes';
import type { CalloutTableFootnotesSettings } from './settings';

export const REF_CLASS = 'footnote-live-ref';
export const LINK_CLASS = 'footnote-live-link';
const POPOVER_CLASS = 'footnote-live-popover';
const FLASH_CLASS = 'footnote-live-flash';
const FLASH_MS = 1600;

/** Lights one line for a moment, so the eye finds the place that a jump reached. */
const flashEffect = StateEffect.define<number>();
const clearFlash = StateEffect.define<null>();
const flashField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, tr) {
		let next = value.map(tr.changes);
		for (const e of tr.effects) {
			if (e.is(flashEffect)) next = Decoration.set([Decoration.line({ class: FLASH_CLASS }).range(e.value)]);
			else if (e.is(clearFlash)) next = Decoration.none;
		}
		return next;
	},
	provide: (f) => EditorView.decorations.from(f),
});

export interface WidgetHost {
	app: App;
	getSettings(): CalloutTableFootnotesSettings;
	isPro(): boolean;
	/** Component that owns the popup renders. */
	component: Component;
}

interface TextSlot {
	node: Text;
	start: number;
}

/** Text nodes of a container with the offset of each one in the joined text. */
export function textSlots(root: HTMLElement): { text: string; slots: TextSlot[] } {
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const slots: TextSlot[] = [];
	let text = '';
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const node = n as Text;
		slots.push({ node, start: text.length });
		text += node.nodeValue ?? '';
	}
	return { text, slots };
}

/** Replaces each located label with the element that make() returns. Works from the end so earlier offsets stay true. */
export function replaceLabels(root: HTMLElement, located: Located[], make: (hit: Located) => HTMLElement): number {
	const { slots } = textSlots(root);
	let done = 0;
	for (const hit of [...located].reverse()) {
		const first = [...slots].reverse().find((s) => s.start <= hit.start);
		const last = [...slots].reverse().find((s) => s.start < hit.end);
		if (!first || !last) continue;
		const range = root.ownerDocument.createRange();
		range.setStart(first.node, hit.start - first.start);
		range.setEnd(last.node, hit.end - last.start);
		range.deleteContents();
		range.insertNode(make(hit));
		done++;
	}
	return done;
}

export class FootnoteWidgets {
	/** The EditorView of each editor, by the element of the editor. */
	private views = new Map<HTMLElement, EditorView>();
	private cache = new WeakMap<EditorView, { doc: unknown; scan: FootnoteScan }>();
	private popover: HTMLElement | null = null;
	private popoverComponent: Component | null = null;
	private timer: number | null = null;
	/** Where the last click on a reference started, for the Pro way back. */
	lastJump: { line: number; ch: number } | null = null;

	constructor(private readonly host: WidgetHost) {}

	/** The editor extension: a plugin that records each EditorView, and the one line highlight of a jump. */
	extension(): Extension {
		return [flashField, this.recordViews()];
	}

	private recordViews(): Extension {
		return ViewPlugin.define((view) => {
			this.views.set(view.dom, view);
			// Widgets that were drawn before the plugin turned on get no post processor call, so one sweep covers them.
			this.sweep(view);
			return {
				destroy: () => {
					this.views.delete(view.dom);
				},
			};
		});
	}

	/** Processes the callouts and table cells that an editor shows now. */
	sweep(view: EditorView): void {
		const win = view.dom.win;
		win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
			for (const el of Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-callout > .markdown-rendered, .cm-table-widget .table-cell-wrapper'))) this.process(el);
		}));
	}

	/** Post processor entry. Obsidian calls it before the widget is in the editor, so the work waits two frames. */
	schedule(el: HTMLElement): void {
		const win = el.win;
		win.requestAnimationFrame(() => win.requestAnimationFrame(() => this.process(el)));
	}

	/** Scan of the note in a view, kept until the text changes (an edit makes a new document object). */
	scanOf(view: EditorView): FootnoteScan {
		const doc = view.state.doc;
		const hit = this.cache.get(view);
		if (hit?.doc === doc) return hit.scan;
		const scan = scanFootnotes(doc.toString());
		this.cache.set(view, { doc, scan });
		return scan;
	}

	/** Finds the labels in one rendered callout or table cell and makes each one a link. Returns the number made. */
	process(el: HTMLElement): number {
		if (!el.isConnected || el.querySelector(`.${REF_CLASS}`)) return 0;
		const editor = el.closest<HTMLElement>('.cm-editor');
		const view = editor ? this.views.get(editor) : undefined;
		if (!view) return 0;
		const isCell = el.classList.contains('table-cell-wrapper');
		const widget = isCell ? el.closest<HTMLElement>('.cm-table-widget') : el.parentElement;
		if (!widget || !(isCell || widget.classList.contains('cm-callout'))) return 0;
		let pos: number;
		try {
			pos = view.posAtDOM(widget);
		} catch {
			return 0;
		}
		const kind = isCell ? 'table' : 'callout';
		const block = blockFrom(this.linesFrom(view, pos, kind), 0, kind);
		const { source, inlineIds } = widgetSource(block, view.state.doc.lineAt(pos).number - 1, isCell ? this.cellPositionOf(el) : undefined);
		if (!source.includes('[^') && inlineIds.length === 0) return 0;
		const body = isCell ? el : (el.querySelector<HTMLElement>('.callout-content') ?? el);
		const located = locateRefs(textSlots(body).text, source);
		if (!located) return 0;
		const native = Array.from(body.querySelectorAll<HTMLElement>('sup.footnote-ref'));
		if (native.length !== inlineIds.length || inlineIds.some((id) => !definitionOf(this.scanOf(view), id))) return 0;
		let done = replaceLabels(body, located, (hit) => this.makeRef(view, hit.id));
		native.forEach((sup, i) => {
			sup.replaceWith(this.makeRef(view, inlineIds[i] ?? ''));
			done++;
		});
		// The popup replaces the local list, after every inline reference in this render has a link.
		if (inlineIds.length && !el.querySelector('sup.footnote-ref')) {
			for (const list of Array.from(el.querySelectorAll(':scope > section.footnotes'))) list.remove();
		}
		return done;
	}

	/** The lines from the one at pos to the first line that ends the block. Reads no more than the block. */
	private linesFrom(view: EditorView, pos: number, kind: 'callout' | 'table'): string[] {
		const doc = view.state.doc;
		const out: string[] = [];
		for (let n = doc.lineAt(pos).number; n <= doc.lines && out.length < MAX_BLOCK_LINES; n++) {
			const text = doc.line(n).text;
			out.push(text);
			if (kind === 'callout' ? !/^\s*>/.test(text) : !text.includes('|')) break;
		}
		return out;
	}

	private cellPositionOf(el: HTMLElement): { row: number; col: number } {
		const td = el.closest('td,th');
		const tr = td?.parentElement;
		const section = tr?.parentElement;
		if (!td || !tr || !section) return { row: -1, col: -1 };
		const row = section.tagName === 'THEAD' ? 0 : 1 + Array.from(section.children).indexOf(tr);
		return { row, col: Array.from(tr.children).indexOf(td) };
	}

	/** The link that takes the place of a label. */
	makeRef(view: EditorView, id: string): HTMLElement {
		const scan = this.scanOf(view);
		const def = definitionOf(scan, id);
		const sup = createEl('sup', { cls: REF_CLASS });
		const label = this.host.getSettings().showNumbers || def?.ch !== undefined ? labelOf(scan, id) : id;
		const link = sup.createEl('a', { cls: LINK_CLASS, text: label, attr: { role: 'link', tabindex: '0', 'data-footnote-id': id, 'aria-label': def ? `Footnote ${label}` : `No definition for [^${id}]` } });
		if (!def) link.addClass('is-missing');
		// A press inside a table cell would start editing the cell, so the press is stopped before the click.
		for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
			link.addEventListener(type, (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
			});
		}
		link.addEventListener('click', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			this.jumpToDefinition(view, id);
		});
		link.addEventListener('keydown', (ev) => {
			if (ev.key !== 'Enter') return;
			ev.preventDefault();
			this.jumpToDefinition(view, id);
		});
		link.addEventListener('mouseenter', () => this.showSoon(view, link, id));
		link.addEventListener('mouseleave', () => this.hide());
		return sup;
	}

	/** Moves the cursor to the definition of id and scrolls to it. Returns false when the note has none. */
	jumpToDefinition(view: EditorView, id: string): boolean {
		const def = definitionOf(this.scanOf(view), id);
		if (!def) return false;
		const line = view.state.doc.line(def.line + 1);
		const from = view.state.doc.lineAt(view.state.selection.main.head);
		this.lastJump = { line: from.number - 1, ch: view.state.selection.main.head - from.from };
		this.hide();
		view.dispatch({ selection: { anchor: line.from + (def.ch !== undefined ? def.ch + 2 : `[^${id}]: `.length) }, scrollIntoView: true, effects: flashEffect.of(line.from) });
		view.focus();
		view.dom.win.setTimeout(() => view.dispatch({ effects: clearFlash.of(null) }), FLASH_MS);
		return true;
	}

	/** Moves the cursor to the first reference of id. Returns false when the note has none. */
	jumpToReference(view: EditorView, id: string): boolean {
		const ref = firstRef(this.scanOf(view), id);
		if (!ref) return false;
		const line = view.state.doc.line(ref.line + 1);
		view.dispatch({ selection: { anchor: line.from + ref.ch }, scrollIntoView: true, effects: flashEffect.of(line.from) });
		view.focus();
		view.dom.win.setTimeout(() => view.dispatch({ effects: clearFlash.of(null) }), FLASH_MS);
		return true;
	}

	private showSoon(view: EditorView, link: HTMLElement, id: string): void {
		if (!this.host.getSettings().hoverPreview) return;
		this.hide();
		this.timer = link.win.setTimeout(() => void this.show(view, link, id), this.host.getSettings().hoverDelayMs);
	}

	private async show(view: EditorView, link: HTMLElement, id: string): Promise<void> {
		const def = definitionOf(this.scanOf(view), id);
		if (!def || !link.isConnected) return;
		const pop = link.ownerDocument.body.createDiv({ cls: `${POPOVER_CLASS} markdown-rendered` });
		const comp = new Component();
		this.host.component.addChild(comp);
		this.popover = pop;
		this.popoverComponent = comp;
		await MarkdownRenderer.render(this.host.app, def.text, pop, '', comp);
		const r = link.getBoundingClientRect();
		const win = link.win;
		pop.addClass('is-shown');
		pop.setCssProps({ '--footnote-live-left': `${Math.max(8, Math.min(r.left, win.innerWidth - pop.offsetWidth - 8))}px`, '--footnote-live-top': `${r.bottom + 6}px` });
	}

	/** Removes the popup and cancels a popup that has not shown yet. */
	hide(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
		this.popover?.remove();
		this.popover = null;
		if (this.popoverComponent) this.host.component.removeChild(this.popoverComponent);
		this.popoverComponent = null;
	}

	/** Editors that the plugin knows. For tests. */
	get viewCount(): number {
		return this.views.size;
	}
}
