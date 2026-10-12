import { describe, expect, it } from 'vitest';
import { definitionOf, inlineFootnotes, inlineId, inlineLabels, locateRefs, panelItems, panelTarget, scanFootnotes, sourceCells, splitRefs, widgetSource } from '../src/footnotes';

// Inline source text stays in the note. Each position has its own id and number.
describe('inline footnotes', () => {
	it('keeps Markdown links, code and escaped brackets in the definition', () => {
		const text = 'Claim^[See [source](https://example.com), `]`, and \\].] end.';
		const notes = inlineFootnotes(text);
		expect(notes).toEqual([{ start: 5, end: text.indexOf(' end.'), text: 'See [source](https://example.com), `]`, and \\].' }]);
	});

	it('skips code spans, escaped carets and incomplete footnotes', () => {
		expect(inlineFootnotes('`^[code]` \\^[escaped] ^[open')).toEqual([]);
		expect(inlineFootnotes('``^[code]`` ^[real]')).toEqual([{ start: 12, end: 19, text: 'real' }]);
	});

	it('does not read a named reference inside inline text as a second footnote', () => {
		expect(splitRefs('A^[Text with [^inside].] and[^real]')).toEqual([{ text: 'A^[Text with [^inside].] and' }, { id: 'real' }]);
		const scan = scanFootnotes('A^[Text with [^inside].] and[^real]\n\n[^real]: Defined.');
		expect(scan.missing).toEqual([]);
		expect(scan.refs.map((ref) => ref.id)).toEqual(['inline 0:1', 'real']);
	});

	it('uses one number order for inline and named footnotes, with repeated named references', () => {
		const scan = scanFootnotes('A^[First.] B[^n] C^[Third.] D[^n]\n\n[^n]: Named.');
		expect(scan.numbers).toEqual({ 'inline 0:1': 1, n: 2, 'inline 0:18': 3 });
		expect(scan.refs.map((ref) => [ref.id, ref.ch])).toEqual([['inline 0:1', 1], ['n', 12], ['inline 0:18', 18], ['n', 29]]);
		expect(scan.missing).toEqual([]);
		expect(scan.unused).toEqual([]);
		expect(definitionOf(scan, 'inline 0:1')).toEqual({ id: 'inline 0:1', line: 0, ch: 1, at: 3, text: 'First.' });
	});

	it('gives equal text at different positions different numbers', () => {
		const scan = scanFootnotes('A^[Same.] B^[Same.]');
		expect(Object.values(scan.numbers)).toEqual([1, 2]);
		expect(scan.defs.map((def) => def.text)).toEqual(['Same.', 'Same.']);
	});

	it('does not use inline text from front matter or a code fence in a callout', () => {
		const text = '---\nkey: ^[metadata]\n---\n> [!note] Code\n> ```md\n> ^[code]\n> ```\n> Real^[Yes.]';
		const scan = scanFootnotes(text);
		expect(scan.refs).toEqual([{ id: 'inline 7:6', line: 7, ch: 6, context: 'callout' }]);
	});

	it('lists inline text in the panel without a missing or unused warning', () => {
		const items = panelItems(scanFootnotes('> [!note] Text\n> Claim^[Source.]'));
		expect(items).toEqual([{ id: 'inline 1:7', label: '1', text: 'Source.', where: 'callout', refs: 1, problem: null }]);
	});

	it('reads a long line with many open brackets in linear time', () => {
		const line = `${'^['.repeat(20000)}^[last]`;
		const start = performance.now();
		const notes = inlineFootnotes(line);
		expect(performance.now() - start).toBeLessThan(500);
		expect(notes).toEqual([{ start: 40000, end: 40007, text: 'last' }]);
		expect(inlineFootnotes('^[a ^[b] c')).toEqual([{ start: 4, end: 8, text: 'b' }]);
	});

	it('moves the panel cursor into inline text, to a named definition or to a missing reference', () => {
		const scan = scanFootnotes('> [!note] Text\n> Claim^[Source.] and[^n] and[^gone]\n\n[^n]: Named.');
		expect(panelTarget(scan, 'inline 1:7')).toEqual({ line: 1, ch: 9 });
		expect(panelTarget(scan, 'n')).toEqual({ line: 3, ch: 6 });
		expect(panelTarget(scan, 'gone')).toEqual({ line: 1, ch: 29 });
		expect(panelTarget(scan, 'none')).toBeNull();
	});

	it('uses ids that named footnotes cannot have', () => {
		expect(inlineId(3, 7)).toBe('inline 3:7');
		expect(splitRefs('[^inline 3:7]')).toEqual([{ text: '[^inline 3:7]' }]);
	});
});

describe('inline widget sources', () => {
	it('keeps local numbers in source matching and tracks global positions in a callout', () => {
		const block = ['> [!note] Title', '> A^[First.] and B[^n].', '> C^[Second.] and D[^n].'];
		const prepared = widgetSource(block, 5);
		expect(prepared).toEqual({ source: 'A[1] and B[^n].\nC[2] and D[^n].', inlineIds: ['inline 6:3', 'inline 7:3'] });
		expect(locateRefs('A[1] and Bn.C[2] and Dn.', prepared.source)?.map((hit) => hit.id)).toEqual(['n', 'n']);
	});

	it('skips code in the callout inline count', () => {
		const prepared = widgetSource(['> [!note] Title', '> ```md', '> ^[code]', '> ```', '> A^[Source.]'], 0);
		expect(prepared.inlineIds).toEqual(['inline 4:3']);
		expect(prepared.source).toBe('^[code]\nA[1]');
	});

	it('starts the local inline number at one in each table cell', () => {
		const block = ['| H^[Header.] | Other |', '| --- | --- |', '| A^[Same.] | B^[Same.] and[^n] |'];
		expect(widgetSource(block, 4, { row: 0, col: 0 })).toEqual({ source: 'H[1]', inlineIds: ['inline 4:3'] });
		expect(widgetSource(block, 4, { row: 1, col: 0 })).toEqual({ source: 'A[1]', inlineIds: ['inline 6:3'] });
		expect(widgetSource(block, 4, { row: 1, col: 1 })).toEqual({ source: 'B[1] and[^n]', inlineIds: ['inline 6:15'] });
	});

	it('keeps source columns after spaces, escaped pipes and pipes inside code', () => {
		const row = '  | A \\| B^[Text.] | `x|y`^[Code.] |';
		const cells = sourceCells(row);
		expect(cells.map((cell) => cell.ch)).toEqual([4, 21]);
		const block = [row, '| --- | --- |'];
		const first = widgetSource(block, 9, { row: 0, col: 0 });
		const second = widgetSource(block, 9, { row: 0, col: 1 });
		expect(first.inlineIds).toEqual([inlineId(9, row.indexOf('^[Text.]'))]);
		expect(second.inlineIds).toEqual([inlineId(9, row.indexOf('^[Code.]'))]);
		expect(first.source).toBe('A | B[1]');
		expect(second.source).toBe('`x|y`[1]');
	});

	it('handles a missing cell and an empty source', () => {
		expect(widgetSource([], 0, { row: 0, col: 0 })).toEqual({ source: '', inlineIds: [] });
		expect(widgetSource([], 0)).toEqual({ source: '', inlineIds: [] });
		expect(inlineLabels('Plain text.')).toBe('Plain text.');
	});
});
