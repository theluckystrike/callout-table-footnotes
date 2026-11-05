import { describe, expect, it } from 'vitest';
import vectors from './vectors/callout-table-footnotes.json';
import { locateInline, scanFootnotes } from '../src/footnotes';
import { GROWTH_LIMIT, growth } from './growth';

interface Case {
	name: string;
	function?: string;
	args: unknown[];
	expected: unknown;
}

describe('golden vectors (packages/spec/vectors/callout-table-footnotes.json)', () => {
	const cases = vectors.cases as Case[];
	it('has at least 20 cases', () => {
		expect(cases.length).toBeGreaterThanOrEqual(20);
	});
	it('has a locateInline case for each paragraph acceptance case', () => {
		expect(cases.filter((c) => c.function === 'locateInline').length).toBeGreaterThanOrEqual(7);
		expect(cases.filter((c) => c.function === 'locateInlineLarge').length).toBe(1);
	});
	for (const c of cases) {
		it(c.name, () => {
			if (c.function === 'locateInline') {
				const [text, named] = c.args as [string, boolean];
				expect(locateInline(text, named)).toEqual(c.expected);
				return;
			}
			if (c.function === 'locateInlineLarge') {
				const [block, times] = c.args as [string[], number];
				// expected.maxMs (a wall-clock limit) is not used: it failed on slow shared CI runners. The guard below divides
				// the time at args[1] repeats by the time at a tenth of the repeats, both measured in this test (s1103 CIFIX).
				const want = c.expected as { count: number; first: number; last: number };
				const textOf = (t: number) => Array.from({ length: t }, () => block.join('\n')).join('\n');
				const text = textOf(times);
				expect(text.split('\n').length).toBe(block.length * times);
				const marks = locateInline(text);
				expect(marks.length).toBe(want.count);
				expect(marks[0]?.number).toBe(want.first);
				expect(marks[marks.length - 1]?.number).toBe(want.last);
				const g = growth((t) => {
					const big = textOf(t);
					return () => locateInline(big);
				}, times);
				expect(g.ratio, g.text).toBeLessThan(GROWTH_LIMIT);
				return;
			}
			const [text] = c.args as [string];
			const s = scanFootnotes(text);
			expect({
				numbers: s.numbers,
				missing: s.missing,
				unused: s.unused,
				refs: s.refs.map((r) => [r.id, r.line, r.ch, r.context]),
				defs: s.defs.map((d) => [d.id, d.line, d.text]),
			}).toEqual(c.expected);
		});
	}
});
