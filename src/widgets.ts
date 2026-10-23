// Live Preview draws a callout and a table as widgets and shows a footnote reference in them as its bare label ("2").
// This module finds each label again and swaps it for a numbered link. It uses public API only: an editor extension
// (a ViewPlugin) to get the EditorView of each editor, and a Markdown post processor that Obsidian runs on each widget.
// In paragraphs, lists and blockquotes the same ViewPlugin replaces each inline footnote with a number widget.
import { Component, MarkdownRenderer, editorInfoField, editorLivePreviewField, type App } from 'obsidian';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type PluginValue, type ViewUpdate } from '@codemirror/view';
import { Prec, StateEffect, StateField, type ChangeSet, type EditorState, type Extension, type Range, type Text as Doc } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { MAX_BLOCK_LINES, blockFrom, widgetSource, definitionOf, firstRef, labelOf, locateInline, locateRefs, scanFootnotes, type FootnoteScan, type InlineMark, type Located } from './footnotes';
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

/** Draws the paragraph numbers again, for example after a setting changes. */
const refreshEffect = StateEffect.define<null>();
/** Wait in ms after the last edit that can change the footnotes before the note is read again. */
export const RESCAN_DELAY_MS = 150;
/**
 * Characters that cannot make, end or move a footnote, a code span, math, a comment, a fence, a table, a callout or a
 * definition. An edit of only these characters, away from the start of a line and away from other characters, keeps
 * the footnotes and their numbers, so the plugin only moves the numbers and does not read the note again.
 */
const SAFE_TEXT = /^[\p{L}\p{N}\p{M} \t.,;?'"()_*+=/@&{}]*$/u;

/** A line break next to an edit joins nothing, so it is a safe neighbour too. */
const SAFE_NEIGHBOUR = (ch: string): boolean => ch === '\n' || SAFE_TEXT.test(ch);

/** The number that takes the place of "^[text]" (or "[^id]") in a paragraph. */
class NumberWidget extends WidgetType {
	constructor(
		readonly owner: FootnoteWidgets,
		readonly mark: InlineMark,
		readonly label: string,
	) {
		super();
	}

	eq(other: NumberWidget): boolean {
		return other.mark.id === this.mark.id && other.mark.kind === this.mark.kind && other.mark.text === this.mark.text && other.label === this.label;
	}

	toDOM(view: EditorView): HTMLElement {
		return this.owner.makeParagraphRef(view, this.mark, this.label);
	}

	/** The link handles its own pointer and key events, so the editor does not move the cursor on a press. */
	ignoreEvent(): boolean {
		return true;
	}
}

/**
 * True when the syntax tree of Obsidian marks the same range as a footnote. An inline footnote starts with a token
 * of the class inline-footnote-start and ends with one of the class inline-footnote-end. A named reference starts with
 * a footref token. A token in a comment or in math is never a footnote, so this check also keeps them plain.
 */
export function treeAgrees(tree: ReturnType<typeof syntaxTree>, mark: InlineMark): boolean {
	if (mark.to > tree.length) return false;
	const start = tree.resolveInner(mark.from, 1);
	if (start.from !== mark.from) return false;
	// Obsidian's parser keeps a comment or math state over lines, also for a "%%" that never closes.
	if (/(?:^|_)(?:comment|math)(?:_|$)/.test(start.name)) return false;
	if (mark.kind === 'named') return start.name.includes('footref') && !start.name.includes('inline-footnote');
	const end = tree.resolveInner(mark.to, -1);
	return start.name.includes('inline-footnote-start') && end.to === mark.to && end.name.includes('inline-footnote-end');
}

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
	private paragraphs = new Map<EditorView, ParagraphNumbers>();
	/** How many times a whole note was read. For tests. */
	scanCount = 0;
	private popover: HTMLElement | null = null;
	private popoverComponent: Component | null = null;
	/** The popup that waits for the hover delay, with the window of its timer (a popout window has its own timers). */
	private timer: { win: Window; id: number } | null = null;
	/** Where the last click on a reference started, and the path of its note, for the Pro way back. */
	private lastJump: { path: string | null; line: number; ch: number } | null = null;

	constructor(private readonly host: WidgetHost) {}

	/** The editor extension: a plugin that records each EditorView, and the one line highlight of a jump. */
	extension(): Extension {
		return [flashField, this.recordViews()];
	}

	private recordViews(): Extension {
		// High precedence: a number covers the whole footnote, also the link marks that Live Preview hides inside it.
		return Prec.high(
			ViewPlugin.define(
				(view) => {
					this.views.set(view.dom, view);
					// Widgets that were drawn before the plugin turned on get no post processor call, so one sweep covers them.
					this.sweep(view);
					const numbers = new ParagraphNumbers(this, view);
					this.paragraphs.set(view, numbers);
					return {
						get decorations() {
							return numbers.decorations;
						},
						update: (u: ViewUpdate) => numbers.update(u),
						destroy: () => {
							numbers.destroy();
							this.paragraphs.delete(view);
							this.views.delete(view.dom);
						},
					} satisfies PluginValue & { decorations: DecorationSet };
				},
				{ decorations: (v) => v.decorations },
			),
		);
	}

	/** Draws the paragraph numbers of each editor again, for example after a setting changes. */
	refresh(): void {
		for (const view of this.views.values()) view.dispatch({ effects: refreshEffect.of(null) });
	}

	/** The paragraph footnotes of a view as they are drawn now. For tests. */
	marksOf(view: EditorView): InlineMark[] {
		return this.paragraphs.get(view)?.current() ?? [];
	}

	/** Reads the whole note: the shared footnote counter and the paragraph marks. Counted for tests. */
	readNote(view: EditorView): { scan: FootnoteScan; marks: InlineMark[] } {
		const scan = this.scanOf(view);
		return { scan, marks: locateInline(view.state.doc.toString(), true, scan) };
	}

	/** The settings, for the paragraph numbers. */
	get settings(): CalloutTableFootnotesSettings {
		return this.host.getSettings();
	}

	/** A number for a paragraph footnote. A click goes to the place of the widget, so it stays right after an edit. */
	makeParagraphRef(view: EditorView, mark: InlineMark, label: string): HTMLElement {
		if (mark.kind === 'named') return this.makeRef(view, mark.id, { label, missing: mark.number === null });
		const sup = this.makeRef(view, mark.id, { label, missing: false, text: mark.text, jump: () => this.jumpIntoWidget(view, sup) });
		return sup;
	}

	/** Moves the cursor to the start of the text of the inline footnote that a widget shows. */
	private jumpIntoWidget(view: EditorView, dom: HTMLElement): void {
		let pos: number;
		try {
			pos = view.posAtDOM(dom);
		} catch {
			return;
		}
		const from = view.state.doc.lineAt(view.state.selection.main.head);
		this.lastJump = { path: view.state.field(editorInfoField, false)?.file?.path ?? null, line: from.number - 1, ch: view.state.selection.main.head - from.from };
		this.hide();
		view.dispatch({ selection: { anchor: Math.min(pos + 2, view.state.doc.length) }, scrollIntoView: true });
		view.focus();
	}

	/** What a link shows: the number, or the id that you typed when "Show numbers" is off. Inline footnotes keep numbers. */
	labelFor(scan: FootnoteScan, id: string): string {
		return this.host.getSettings().showNumbers || definitionOf(scan, id)?.ch !== undefined ? labelOf(scan, id) : id;
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
		this.scanCount++;
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
	makeRef(view: EditorView, id: string, known?: { label: string; missing: boolean; text?: string; jump?: () => void }): HTMLElement {
		const scan = known ? null : this.scanOf(view);
		const missing = known ? known.missing : !definitionOf(scan as FootnoteScan, id);
		const sup = createEl('sup', { cls: REF_CLASS });
		const label = known ? known.label : this.labelFor(scan as FootnoteScan, id);
		const link = sup.createEl('a', { cls: LINK_CLASS, text: label, attr: { role: 'link', tabindex: '0', 'data-footnote-id': id, 'aria-label': missing ? `No definition for [^${id}]` : `Footnote ${label}` } });
		if (missing) link.addClass('is-missing');
		const jump = known?.jump ?? (() => void this.jumpToDefinition(view, id));
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
			jump();
		});
		link.addEventListener('keydown', (ev) => {
			if (ev.key !== 'Enter') return;
			ev.preventDefault();
			jump();
		});
		link.addEventListener('mouseenter', () => this.showSoon(view, link, id, known?.text));
		link.addEventListener('mouseleave', () => this.hide());
		return sup;
	}

	/** Moves the cursor to the definition of id and scrolls to it. Returns false when the note has none. */
	jumpToDefinition(view: EditorView, id: string): boolean {
		const def = definitionOf(this.scanOf(view), id);
		if (!def) return false;
		const line = view.state.doc.line(def.line + 1);
		const from = view.state.doc.lineAt(view.state.selection.main.head);
		this.lastJump = { path: view.state.field(editorInfoField, false)?.file?.path ?? null, line: from.number - 1, ch: view.state.selection.main.head - from.from };
		this.hide();
		view.dispatch({ selection: { anchor: line.from + Math.min(def.at, line.length) }, scrollIntoView: true, effects: flashEffect.of(line.from) });
		view.focus();
		view.dom.win.setTimeout(() => view.dispatch({ effects: clearFlash.of(null) }), FLASH_MS);
		return true;
	}

	/** Where the last click on a reference started, when it was in the note at path. Else null. */
	backTarget(path: string | null): { line: number; ch: number } | null {
		const jump = this.lastJump;
		return jump && jump.path === path ? { line: jump.line, ch: jump.ch } : null;
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

	private showSoon(view: EditorView, link: HTMLElement, id: string, text?: string): void {
		if (!this.host.getSettings().hoverPreview) return;
		this.hide();
		const win = link.win;
		this.timer = { win, id: win.setTimeout(() => void this.show(view, link, id, text), this.host.getSettings().hoverDelayMs) };
	}

	/** Shows the popup. text is the inline text of a paragraph widget; else the definition comes from the note. */
	private async show(view: EditorView, link: HTMLElement, id: string, text?: string): Promise<void> {
		const def = text !== undefined ? { text } : definitionOf(this.scanOf(view), id);
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
		if (this.timer !== null) this.timer.win.clearTimeout(this.timer.id);
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

/** True when the text has one of the needles. Reads the document in chunks, so it makes no copy of the note. */
export function docHas(doc: Doc, needles: string[]): boolean {
	let tail = '';
	for (const iter = doc.iter(); !iter.next().done; ) {
		const chunk = tail + iter.value;
		if (needles.some((n) => chunk.includes(n))) return true;
		tail = chunk.slice(-1);
	}
	return false;
}

/** True when the edit cannot change any footnote, its number or its text. Then the marks only move. */
export function safeEdit(changes: ChangeSet, before: EditorState, after: EditorState, marks: InlineMark[]): boolean {
	let safe = true;
	changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		if (!safe) return;
		const removed = before.doc.sliceString(fromA, toA);
		if (!SAFE_TEXT.test(removed) || !SAFE_TEXT.test(inserted.toString())) safe = false;
		// The characters on both sides must be safe too, so the edit cannot join or split syntax.
		else if (!SAFE_NEIGHBOUR(after.doc.sliceString(Math.max(0, fromB - 1), fromB)) || !SAFE_NEIGHBOUR(after.doc.sliceString(toB, Math.min(after.doc.length, toB + 1)))) safe = false;
		// Spaces at the start of a line can make a definition line or its continuation.
		else if (!/\S/.test(after.doc.sliceString(after.doc.lineAt(fromB).from, fromB))) safe = false;
		// An edit in or at the edge of a footnote changes its text.
		else if (marks.some((m) => m.from <= toA && m.to >= fromA)) safe = false;
	});
	return safe;
}

/**
 * The paragraph numbers of one editor. The whole note is read only when the editor opens, after a setting changes,
 * and after an edit that can change a footnote (with a short delay, so typing does not read the note on each key).
 * A note without "^[" (or "[^" for named references) is never read. Other edits only move the numbers.
 */
class ParagraphNumbers {
	decorations: DecorationSet = Decoration.none;
	/** The marks of the note, exact for markDoc. */
	private marks: InlineMark[] = [];
	private markDoc: Doc | null = null;
	/** False when the note has no footnote syntax at all. */
	private hasSyntax = false;
	/** A delayed read of the note is waiting; until then the drawn numbers only move with the text. */
	private timer: number | null = null;

	constructor(
		private readonly owner: FootnoteWidgets,
		private readonly view: EditorView,
	) {
		this.reload();
		this.decorations = this.build(view.state);
	}

	current(): InlineMark[] {
		return this.markDoc === this.view.state.doc ? this.marks : [];
	}

	private needles(): string[] {
		return this.owner.settings.namedParagraphs ? ['^[', '[^'] : ['^['];
	}

	/** Reads the note again, unless it has no footnote syntax. */
	private reload(): void {
		const doc = this.view.state.doc;
		this.hasSyntax = this.active(this.view.state) && docHas(doc, this.needles());
		this.marks = this.hasSyntax ? this.owner.readNote(this.view).marks : [];
		this.markDoc = doc;
	}

	private active(state: EditorState): boolean {
		const s = this.owner.settings;
		return (s.inlineParagraphs || s.namedParagraphs) && !!state.field(editorLivePreviewField, false);
	}

	update(u: ViewUpdate): void {
		const refresh = u.transactions.some((t) => t.effects.some((e) => e.is(refreshEffect)));
		const modeChanged = u.startState.field(editorLivePreviewField, false) !== u.state.field(editorLivePreviewField, false);
		if (refresh || modeChanged) {
			this.cancel();
			this.reload();
			this.decorations = this.build(u.state);
			return;
		}
		if (u.docChanged) {
			if (!this.active(u.state)) {
				this.markDoc = u.state.doc;
				return;
			}
			if (!this.hasSyntax && this.timer === null) {
				// Only the new text and its neighbours can bring footnote syntax into a note that had none.
				let found = false;
				u.changes.iterChangedRanges((_fa, _ta, fromB, toB) => {
					if (!found && this.needles().some((n) => u.state.doc.sliceString(Math.max(0, fromB - 1), Math.min(u.state.doc.length, toB + 1)).includes(n))) found = true;
				});
				if (!found) {
					this.markDoc = u.state.doc;
					return;
				}
				this.schedule(u);
				return;
			}
			if (this.timer === null && this.markDoc === u.startState.doc && safeEdit(u.changes, u.startState, u.state, this.marks)) {
				this.marks = this.marks.map((m) => mapMark(m, u.changes));
				this.markDoc = u.state.doc;
				this.decorations = this.build(u.state);
				return;
			}
			this.schedule(u);
			return;
		}
		if (this.timer !== null) {
			// Waiting for the delayed read: keep the moved numbers, and show the source where the selection is.
			if (u.selectionSet) this.decorations = this.decorations.update({ filter: (from, to) => !touches(u.state, from, to) });
			return;
		}
		if (u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = this.build(u.state);
	}

	/** Moves the drawn numbers with the edit, drops the ones the edit touches, and reads the note after a short delay. */
	private schedule(u: ViewUpdate): void {
		const changed: Array<[number, number]> = [];
		u.changes.iterChangedRanges((_fa, _ta, fromB, toB) => changed.push([fromB, toB]));
		this.decorations = this.decorations.map(u.changes).update({ filter: (from, to) => !touches(u.state, from, to) && !changed.some(([a, b]) => from <= b && to >= a) });
		this.cancel();
		const win = this.view.dom.win;
		this.timer = win.setTimeout(() => {
			this.timer = null;
			this.view.dispatch({ effects: refreshEffect.of(null) });
		}, RESCAN_DELAY_MS);
	}

	private cancel(): void {
		if (this.timer !== null) this.view.dom.win.clearTimeout(this.timer);
		this.timer = null;
	}

	destroy(): void {
		this.cancel();
	}

	/** Number widgets for the marks in the visible text, where the syntax tree agrees and the selection does not touch. */
	private build(state: EditorState): DecorationSet {
		if (!this.hasSyntax || this.markDoc !== state.doc || this.marks.length === 0 || !this.active(state)) return Decoration.none;
		const settings = this.owner.settings;
		const marks = this.marks;
		// No parse wait here: text that the parser has not reached stays as it is until the tree grows.
		const tree = syntaxTree(state);
		const out: Array<Range<Decoration>> = [];
		for (const visible of this.view.visibleRanges) {
			// The marks are in text order, so a binary search finds the first one in the visible range.
			let lo = 0;
			let hi = marks.length;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if ((marks[mid]?.to ?? 0) < visible.from) lo = mid + 1;
				else hi = mid;
			}
			for (let i = lo; i < marks.length; i++) {
				const mark = marks[i];
				if (!mark || mark.from > visible.to) break;
				if (mark.kind === 'inline' ? !settings.inlineParagraphs : !settings.namedParagraphs) continue;
				if (touches(state, mark.from, mark.to)) continue;
				if (!treeAgrees(tree, mark)) continue;
				const label = mark.kind === 'inline' || settings.showNumbers ? String(mark.number ?? mark.id) : mark.id;
				out.push(Decoration.replace({ widget: new NumberWidget(this.owner, mark, label) }).range(mark.from, mark.to));
			}
		}
		return Decoration.set(out, true);
	}
}

/** True when a selection range touches from..to, ends included. */
function touches(state: EditorState, from: number, to: number): boolean {
	return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/** A mark moved by an edit that does not touch it. */
function mapMark(mark: InlineMark, changes: ChangeSet): InlineMark {
	const from = changes.mapPos(mark.from, 1);
	const shift = from - mark.from;
	return shift === 0 ? mark : { ...mark, from, to: mark.to + shift, textFrom: mark.textFrom + shift };
}
