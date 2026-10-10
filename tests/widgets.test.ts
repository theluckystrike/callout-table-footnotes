import { describe, expect, it } from 'vitest';
import { replaceLabels, textSlots } from '../src/widgets';
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
