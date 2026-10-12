import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { App, Component } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/settings';
import { FootnoteWidgets, replaceLabels, textSlots } from '../src/widgets';
import { locateRefs } from '../src/footnotes';

function html(s: string): HTMLElement {
	const el = document.createElement('div');
	el.innerHTML = s;
	return el;
}
const make = (hit: { id: string }) => {
	const sup = document.createElement('sup');
	sup.className = 'footnote-live-ref';
	sup.textContent = `<${hit.id}>`;
	return sup;
};

describe('replaceLabels', () => {
	it('replaces a label inside one text node', () => {
		const el = html('<p>Callout body with a reference2 inside.</p>');
		const hits = locateRefs(textSlots(el).text, 'Callout body with a reference[^2] inside.');
		expect(hits).not.toBeNull();
		expect(replaceLabels(el, hits ?? [], make)).toBe(1);
		expect(el.innerHTML).toBe('<p>Callout body with a reference<sup class="footnote-live-ref">&lt;2&gt;</sup> inside.</p>');
	});
	it('replaces several labels, also next to inline markup', () => {
		const el = html('<p>a<strong>bold</strong>1 and <em>x</em>b-2 end</p>');
		const hits = locateRefs(textSlots(el).text, 'a**bold**[^1] and *x*[^b-2] end');
		expect(replaceLabels(el, hits ?? [], make)).toBe(2);
		expect(el.querySelectorAll('sup').length).toBe(2);
		expect(el.textContent).toBe('abold<1> and x<b-2> end');
	});
	it('leaves the text alone when no label is found', () => {
		const el = html('<p>unrelated words</p>');
		expect(locateRefs(textSlots(el).text, 'Median[^2]')).toBeNull();
		expect(el.innerHTML).toBe('<p>unrelated words</p>');
	});
	it('reads the text nodes in order with their offsets', () => {
		const { text, slots } = textSlots(html('ab<b>cd</b>ef'));
		expect(text).toBe('abcdef');
		expect(slots.map((s) => s.start)).toEqual([0, 2, 4]);
	});
});


describe('inline link navigation', () => {
	const text = 'Before.\n> [!note] Source\n> Claim^[Inline source.] and[^named].\n\n[^named]: Named source.';
	function host(showNumbers = true) {
		const widgets = new FootnoteWidgets({
			app: App.createConfigured__({ files: {} }) as never,
			component: new Component(),
			getSettings: () => ({ ...DEFAULT_SETTINGS, showNumbers }),
			isPro: () => false,
		});
		const dom = document.createElement('div');
		Object.defineProperty(dom, 'win', { value: window });
		const dispatch = vi.fn();
		const focus = vi.fn();
		const view = { state: EditorState.create({ doc: text }), dom, dispatch, focus } as unknown as EditorView;
		return { widgets, view, dispatch, focus };
	}

	it('keeps an inline number when named labels are on', () => {
		const { widgets, view } = host(false);
		expect(widgets.makeRef(view, 'inline 2:7').textContent).toBe('1');
		expect(widgets.makeRef(view, 'named').textContent).toBe('named');
	});

	it('clicks an inline link into its text without Pro', () => {
		vi.useFakeTimers();
		try {
			const { widgets, view, dispatch, focus } = host();
			const link = widgets.makeRef(view, 'inline 2:7').querySelector('a');
			link?.click();
			expect(dispatch.mock.calls[0]?.[0].selection).toEqual({ anchor: text.indexOf('^[Inline') + 2 });
			expect(focus).toHaveBeenCalledOnce();
		} finally {
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});

	it('uses Enter for the same source jump', () => {
		vi.useFakeTimers();
		try {
			const { widgets, view, dispatch } = host();
			const link = widgets.makeRef(view, 'inline 2:7').querySelector('a');
			link?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			expect(dispatch.mock.calls[0]?.[0].selection).toEqual({ anchor: text.indexOf('^[Inline') + 2 });
		} finally {
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});

	it('stops a press on the link before the table can start a cell edit', () => {
		const { widgets, view } = host();
		const root = widgets.makeRef(view, 'inline 2:7');
		const parentPress = vi.fn();
		root.addEventListener('mousedown', parentPress);
		const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
		root.querySelector('a')?.dispatchEvent(press);
		expect(press.defaultPrevented).toBe(true);
		expect(parentPress).not.toHaveBeenCalled();
	});
});
