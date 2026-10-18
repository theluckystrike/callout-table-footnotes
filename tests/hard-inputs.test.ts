import { expect, it } from 'vitest';
import { scanFootnotes, labelOf, widgetSource, locateRefs } from '../src/footnotes';
it('numbers named footnotes that share object property names', () => {
 const s = scanFootnotes('> [!note]\n> > [!tip]\n> > | Item |\n> > | --- |\n> > | Value[^constructor] and[^__proto__] |\n\n[^constructor]: First.\n[^__proto__]: Second.');
 expect(labelOf(s, 'constructor')).toBe('1');
 expect(labelOf(s, '__proto__')).toBe('2');
 expect(labelOf(s, 'toString')).toBe('toString');
});
it('keeps a shorter or different fence inside a fenced code block', () => {
 const s = scanFootnotes('> [!note]\n> ````text\n> ```\n> hidden[^x]\n> ~~~\n> ````\n> shown[^y]\n\n[^x]: Code.\n[^y]: Text.');
 expect(s.refs.map(r => r.id)).toEqual(['y']);
});
it('scans a reference at the end of a 5000 line note', () => {
 const s = scanFootnotes('padding\n'.repeat(4997) + '> [!note]\n> Claim[^end]\n[^end]: Source.');
 expect(s.refs[0]?.line).toBe(4998);
 expect(labelOf(s, 'end')).toBe('1');
});

it('does not replace a named reference inside fenced callout code', () => {
 const block = ['> [!note]', '> ````', '> hidden[^x]', '> ```', '> hidden[^x]', '> ````', '> shown[^y]'];
 const source = widgetSource(block, 0).source;
 const located = locateRefs('hidden[^x]```hidden[^x]showny', source);
 expect(located?.map(r => r.id)).toEqual(['y']);
});

it('includes label punctuation when it replaces a rendered reference', () => {
 const text = 'Valueconstructor and__proto__';
 const located = locateRefs(text, 'Value[^constructor] and[^__proto__]');
 expect(located?.map(r => text.slice(r.start, r.end))).toEqual(['constructor', '__proto__']);
});
it('keeps a full supplementary Unicode character in a reference range', () => {
 const text = 'Value𝒜';
 const located = locateRefs(text, 'Value[^𝒜]');
 expect(located?.map(r => text.slice(r.start, r.end))).toEqual(['𝒜']);
});
