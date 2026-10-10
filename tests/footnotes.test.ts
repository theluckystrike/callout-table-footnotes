import { describe, expect, it } from 'vitest';
import {
	blockFrom,
	calloutSource,
	cellSource,
	defIdOnLine,
	definitionOf,
	describeProblems,
	firstRef,
	labelOf,
	locateRefs,
	panelItems,
	scanFootnotes,
	splitCells,
	splitRefs,
	stripLine,
} from '../src/footnotes';

describe('splitRefs', () => {
	it('splits text and references', () => {
		expect(splitRefs('a[^1]b[^two]')).toEqual([{ text: 'a' }, { id: '1' }, { text: 'b' }, { id: 'two' }]);
	});
	it('keeps a definition label as text', () => {
		expect(splitRefs('[^1]: text')).toEqual([{ text: '[^1]: text' }]);
	});
	it('ignores references in code spans and after a backslash', () => {
		expect(splitRefs('`[^1]` and \\[^2] and ``x [^3] y``')).toEqual([{ text: '`[^1]` and \\[^2] and ``x [^3] y``' }]);
	});
	it('does not read inline footnotes or empty labels', () => {
		expect(splitRefs('a^[inline] and [^] and [^ x]')).toEqual([{ text: 'a^[inline] and [^] and [^ x]' }]);
	});
});

describe('stripLine', () => {
	it('removes list, task and heading marks', () => {
		expect(stripLine('- item')).toBe('item');
		expect(stripLine('3. item')).toBe('item');
		expect(stripLine('- [x] done')).toBe('done');
		expect(stripLine('## Head')).toBe('Head');
	});
	it('reduces links to the text that shows', () => {
		expect(stripLine('see [text](https://example.com/a) and [[Note|alias]] and [[Plain]] and [[Note#Head]]')).toBe('see [text] and alias and Plain and Note');
	});
	it('drops embeds, comments, html tags and block ids', () => {
		expect(stripLine('a ![[pic.png]] b ![alt](x.png) c %%hidden%% d<br>e ^abc12')).toBe('a  b  c  de');
	});
	it('keeps a reference that is followed by parentheses', () => {
		expect(stripLine('word[^1](not a link)')).toBe('word[^1](not a link)');
	});
	it('drops a nested callout marker', () => {
		expect(stripLine('[!tip]- Inner title')).toBe('Inner title');
	});
});

describe('blocks', () => {
	const lines = ['text', '> [!note] T', '> a[^1]', '>', '> b', 'after', '| h | i |', '| - | - |', '| x | y |', 'end'];
	it('takes a run of quote lines', () => {
		expect(blockFrom(lines, 1, 'callout')).toEqual(['> [!note] T', '> a[^1]', '>', '> b']);
	});
	it('takes a run of lines with a pipe', () => {
		expect(blockFrom(lines, 6, 'table')).toEqual(['| h | i |', '| - | - |', '| x | y |']);
	});
	it('ends at the end of the text', () => {
		expect(blockFrom(['> a'], 0, 'callout')).toEqual(['> a']);
		expect(blockFrom([], 0, 'table')).toEqual([]);
	});
	it('takes the body of a callout without the title line', () => {
		expect(calloutSource(['> [!note] T', '> a[^1] b', '> - c', '> > d'])).toBe('a[^1] b\nc\nd');
	});
	it('keeps the text of a code block in a callout', () => {
		expect(calloutSource(['> [!note] T', '> ```js', '> let a = 1;', '> ```', '> after[^1]'])).toBe('let a = 1;\nafter[^1]');
	});
});

describe('table cells', () => {
	it('splits a row', () => {
		expect(splitCells('| a | b[^1] | c |')).toEqual(['a', 'b[^1]', 'c']);
		expect(splitCells('a | b')).toEqual(['a', 'b']);
	});
	it('keeps an escaped pipe and a pipe in code in the cell', () => {
		expect(splitCells('| a \\| b | `c | d` | e |')).toEqual(['a | b', '`c | d`', 'e']);
	});
	it('keeps an empty cell', () => {
		expect(splitCells('| a |  | c |')).toEqual(['a', '', 'c']);
	});
	it('finds the source of a header cell and of a body cell', () => {
		const block = ['| H1 | H2[^h] |', '| -- | -- |', '| a | b[^1] |', '| c | d[^2] |'];
		expect(cellSource(block, 0, 1)).toBe('H2[^h]');
		expect(cellSource(block, 1, 1)).toBe('b[^1]');
		expect(cellSource(block, 2, 1)).toBe('d[^2]');
		expect(cellSource(block, 9, 0)).toBe('');
		expect(cellSource(block, 1, 7)).toBe('');
	});
});

describe('locateRefs', () => {
	it('finds a label by the text before it', () => {
		const got = locateRefs('Median yield rose by 14 percent2 in the plots.', 'Median yield rose by 14 percent[^2] in the plots.');
		expect(got).toEqual([{ id: '2', start: 31, end: 32 }]);
	});
	it('finds named labels and repeated labels', () => {
		const src = 'Alpha [^note] then beta[^b-2] and again [^note] end.';
		const r = 'Alpha note then betab-2 and again note end.';
		expect(locateRefs(r, src)?.map((h) => [h.id, r.slice(h.start, h.end)])).toEqual([
			['note', 'note'],
			['b-2', 'b-2'],
			['note', 'note'],
		]);
	});
	it('works with a label at the start and at the end', () => {
		expect(locateRefs('1 text 2', '[^1] text [^2]')?.map((h) => [h.start, h.end])).toEqual([
			[0, 1],
			[7, 8],
		]);
	});
	it('ignores markdown marks and spaces in the source', () => {
		expect(locateRefs('bold word3 end', '**bold** `word`[^3] _end_')).toEqual([{ id: '3', start: 9, end: 10 }]);
	});
	it('returns null when the text before a label does not match', () => {
		expect(locateRefs('something else entirely 2', 'Median[^2]')).toBeNull();
	});
	it('returns an empty list for a source with no references', () => {
		expect(locateRefs('plain text', 'plain text')).toEqual([]);
	});
	it('skips an id that has no letter or digit', () => {
		expect(locateRefs('a b', 'a[^-] b')).toEqual([]);
	});
	it('handles letters outside ASCII', () => {
		const r = 'Zażółć gęślą 1 jaźń';
		expect(locateRefs(r, 'Zażółć gęślą[^1] jaźń')?.map((h) => r.slice(h.start, h.end))).toEqual(['1']);
	});
});

describe('scanFootnotes helpers', () => {
	const text = 'Intro[^b] and[^a] and[^gone].\n\n[^a]: Def A.\n[^b]: Def B.\n[^old]: Unused.\n';
	const scan = scanFootnotes(text);
	it('numbers by first reference', () => {
		expect(scan.numbers).toEqual({ b: 1, a: 2 });
		expect(labelOf(scan, 'a')).toBe('2');
		expect(labelOf(scan, 'gone')).toBe('gone');
	});
	it('finds problems', () => {
		expect(scan.missing).toEqual(['gone']);
		expect(scan.unused).toEqual(['old']);
		expect(describeProblems(scan)).toBe('Footnotes: 1 without a definition ([^gone]); 1 never used ([^old]).');
		expect(describeProblems(scanFootnotes('A[^1]\n\n[^1]: x\n'))).toBe('Footnotes: all 1 have a reference and a definition.');
	});
	it('looks up definitions and references', () => {
		expect(definitionOf(scan, 'a')?.text).toBe('Def A.');
		expect(definitionOf(scan, 'zz')).toBeNull();
		expect(firstRef(scan, 'a')?.ch).toBe(13);
		expect(firstRef(scan, 'zz')).toBeNull();
		expect(defIdOnLine(scan, 2)).toBe('a');
		expect(defIdOnLine(scan, 0)).toBeNull();
	});
	it('lists the panel rows: numbered, then missing, then unused', () => {
		expect(panelItems(scan).map((i) => [i.label, i.problem, i.refs, i.text])).toEqual([
			['1', null, 1, 'Def B.'],
			['2', null, 1, 'Def A.'],
			['gone', 'missing', 1, ''],
			['old', 'unused', 0, 'Unused.'],
		]);
	});
	it('names where a footnote is used', () => {
		const s = scanFootnotes('> [!note] T\n> a[^1]\n\n| h |\n| - |\n| b[^1] |\n\n[^1]: x\n');
		expect(panelItems(s)[0]?.where).toBe('callout, table');
	});
});
